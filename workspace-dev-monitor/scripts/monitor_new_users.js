#!/usr/bin/env node

/**
 * New User Monitor
 * Tracks new user signups across all Neon DB projects
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

// State file to track last check time
const STATE_FILE = path.join(process.env.HOME, '.openclaw', 'workspace-dev-monitor', 'last-user-check.json');

// Common user table patterns to look for
const USER_TABLE_PATTERNS = ['users', 'user', 'accounts', 'customers', 'members', 'profiles'];
const TIMESTAMP_COLUMNS = ['created_at', 'createdat', 'createdAt', 'signup_date', 'registered_at', 'date_created', 'timestamp', 'created', 'updatedAt', 'updated_at'];

async function fetchNeonAPI(endpoint) {
  try {
    const response = await fetch(`${NEON_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${NEON_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

function loadLastCheckTime() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return new Date(data.lastCheck);
    }
  } catch (error) {
    console.log('No previous check time found, checking last 24 hours');
  }
  // Default: check last 24 hours
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function saveLastCheckTime() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastCheck: new Date().toISOString() }));
  } catch (error) {
    console.error('Could not save check time:', error.message);
  }
}

async function connectToDatabase(connectionString) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  return client;
}

async function findUserTables(client) {
  try {
    // Get all tables in public schema
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const allTables = result.rows.map(r => r.table_name);
    console.log(`  Found ${allTables.length} total tables`);

    // Find likely user tables
    const userTables = allTables.filter(table =>
      USER_TABLE_PATTERNS.some(pattern =>
        table.toLowerCase().includes(pattern)
      )
    );

    return userTables;
  } catch (error) {
    console.error(`  Error finding tables: ${error.message}`);
    return [];
  }
}

async function findTimestampColumn(client, tableName) {
  try {
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [tableName]);

    const columns = result.rows;

    // Look for timestamp columns
    for (const pattern of TIMESTAMP_COLUMNS) {
      const col = columns.find(c =>
        c.column_name.toLowerCase() === pattern.toLowerCase()
      );
      if (col) return col.column_name;
    }

    // Look for any timestamp-like column
    const timestampCol = columns.find(c =>
      c.data_type.includes('timestamp') ||
      c.column_name.toLowerCase().includes('date') ||
      c.column_name.toLowerCase().includes('time')
    );

    return timestampCol ? timestampCol.column_name : null;
  } catch (error) {
    return null;
  }
}

async function getTableStructure(client, tableName) {
  try {
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [tableName]);

    return result.rows;
  } catch (error) {
    return [];
  }
}

async function checkNewUsers(client, tableName, timestampColumn, lastCheck) {
  try {
    // Get columns to display
    const structure = await getTableStructure(client, tableName);

    // Find useful columns to display (id, email, name, username, etc.)
    const displayColumns = ['id', 'email', 'username', 'name', 'full_name', 'first_name'];
    const availableColumns = structure
      .filter(col => displayColumns.includes(col.column_name.toLowerCase()))
      .map(col => col.column_name);

    if (availableColumns.length === 0) {
      // Fallback: just use first few columns
      availableColumns.push(...structure.slice(0, 3).map(c => c.column_name));
    }

    // Count new users (use quoted identifiers for case-sensitive columns)
    const countResult = await client.query(`
      SELECT COUNT(*) as count
      FROM "${tableName}"
      WHERE "${timestampColumn}" > $1
    `, [lastCheck.toISOString()]);

    const newCount = parseInt(countResult.rows[0].count);

    if (newCount === 0) {
      return { count: 0, users: [] };
    }

    // Get details of new users (limit to 10 most recent)
    const selectColumns = availableColumns.map(c => `"${c}"`).join(', ');
    const usersResult = await client.query(`
      SELECT ${selectColumns}, "${timestampColumn}"
      FROM "${tableName}"
      WHERE "${timestampColumn}" > $1
      ORDER BY "${timestampColumn}" DESC
      LIMIT 10
    `, [lastCheck.toISOString()]);

    return {
      count: newCount,
      users: usersResult.rows,
      columns: availableColumns,
      timestampColumn
    };
  } catch (error) {
    console.error(`  Error checking ${tableName}: ${error.message}`);
    return { count: 0, users: [], error: error.message };
  }
}

async function sendAlertToSlack(projectName, tableName, data) {
  let message = `🎉 *New Users Detected*\n\n`;
  message += `*Project:* ${projectName}\n`;
  message += `*Table:* ${tableName}\n`;
  message += `*New Users:* ${data.count}\n\n`;

  if (data.users.length > 0) {
    message += `*Recent Signups:*\n`;

    data.users.slice(0, 5).forEach((user, i) => {
      message += `${i + 1}. `;

      // Display available user info
      data.columns.forEach((col, idx) => {
        if (user[col]) {
          if (idx > 0) message += ' | ';
          message += `${col}: ${user[col]}`;
        }
      });

      // Add timestamp
      const signupTime = new Date(user[data.timestampColumn]);
      message += `\n   Joined: ${signupTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST\n`;
    });

    if (data.count > 5) {
      message += `\n...and ${data.count - 5} more\n`;
    }
  }

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        text: message
      })
    });

    const result = await response.json();
    if (result.ok) {
      console.log(`  ✅ Alert sent to Slack`);
    } else {
      console.log(`  ⚠️  Slack send failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`  ⚠️  Could not send to Slack: ${error.message}`);
  }
}

async function monitorProject(project, lastCheck) {
  const projectId = project.id;
  const projectName = project.name || projectId;

  console.log(`\n📊 Checking: ${projectName}`);
  console.log('─'.repeat(60));

  try {
    // Get primary branch
    const branches = await fetchNeonAPI(`/projects/${projectId}/branches`);
    if (!branches || !branches.branches) {
      console.log('  ❌ Could not fetch branches');
      return { project: projectName, newUsers: 0 };
    }

    const primaryBranch = branches.branches.find(b => b.primary);
    if (!primaryBranch) {
      console.log('  ❌ No primary branch found');
      return { project: projectName, newUsers: 0 };
    }

    // Get database info
    const databases = await fetchNeonAPI(`/projects/${projectId}/branches/${primaryBranch.id}/databases`);
    if (!databases || !databases.databases || databases.databases.length === 0) {
      console.log('  ❌ No databases found');
      return { project: projectName, newUsers: 0 };
    }

    const database = databases.databases[0];

    // Get connection string
    const endpoints = await fetchNeonAPI(`/projects/${projectId}/endpoints`);
    if (!endpoints || !endpoints.endpoints) {
      console.log('  ❌ No endpoints found');
      return { project: projectName, newUsers: 0 };
    }

    const endpoint = endpoints.endpoints.find(e => e.branch_id === primaryBranch.id);
    if (!endpoint) {
      console.log('  ❌ No endpoint for primary branch');
      return { project: projectName, newUsers: 0 };
    }

    // Build connection string (note: we'd need password from project secrets)
    console.log(`  Database: ${database.name}`);
    console.log(`  Endpoint: ${endpoint.host}`);
    console.log(`  ℹ️  Connection requires database password`);

    return { project: projectName, newUsers: 0, requiresPassword: true };

  } catch (error) {
    console.error(`  Error monitoring ${projectName}: ${error.message}`);
    return { project: projectName, newUsers: 0, error: error.message };
  }
}

async function monitorDirectConnection(connectionString, projectName, lastCheck) {
  console.log(`\n📊 Checking: ${projectName} (Direct Connection)`);
  console.log('─'.repeat(60));

  let totalNewUsers = 0;
  let client;

  try {
    client = await connectToDatabase(connectionString);
    console.log('  ✅ Connected to database');

    // Find user tables
    const userTables = await findUserTables(client);

    if (userTables.length === 0) {
      console.log('  ⚠️  No user tables found');
      await client.end();
      return { project: projectName, newUsers: 0 };
    }

    console.log(`  Found ${userTables.length} user table(s): ${userTables.join(', ')}`);

    // Check each user table
    for (const tableName of userTables) {
      console.log(`\n  Checking table: ${tableName}`);

      const timestampColumn = await findTimestampColumn(client, tableName);

      if (!timestampColumn) {
        console.log(`    ⚠️  No timestamp column found, skipping`);
        continue;
      }

      console.log(`    Using timestamp column: ${timestampColumn}`);
      console.log(`    Checking since: ${lastCheck.toLocaleString()}`);

      const data = await checkNewUsers(client, tableName, timestampColumn, lastCheck);

      if (data.count > 0) {
        console.log(`    🎉 Found ${data.count} new user(s)!`);
        totalNewUsers += data.count;

        // Send Slack alert
        await sendAlertToSlack(projectName, tableName, data);
      } else {
        console.log(`    ✅ No new users`);
      }
    }

    await client.end();
    return { project: projectName, newUsers: totalNewUsers };

  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    if (client) await client.end();
    return { project: projectName, newUsers: 0, error: error.message };
  }
}

async function main() {
  console.log('👥 New User Monitor');
  console.log('═'.repeat(60));

  const lastCheck = loadLastCheckTime();
  console.log(`\nChecking for new users since: ${lastCheck.toLocaleString()}`);
  console.log('');

  // Monitor Ultron with direct connection (we have the connection string)
  const ultronConnection = process.env.NEON_DB_URL;

  const ultronResult = await monitorDirectConnection(ultronConnection, 'Ultron', lastCheck);

  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`  Project: ${ultronResult.project}`);
  console.log(`  New Users: ${ultronResult.newUsers}`);

  if (ultronResult.error) {
    console.log(`  Error: ${ultronResult.error}`);
  }

  // Save check time for next run
  saveLastCheckTime();

  console.log('\n✨ User monitoring complete!');
  console.log(`Next check will look for users after: ${new Date().toLocaleString()}`);
}

main().catch(console.error);
