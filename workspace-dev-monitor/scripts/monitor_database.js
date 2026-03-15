#!/usr/bin/env node

/**
 * Database Monitor
 * Tracks database activity, new entries, schema changes, and performance
 * Supports: Neon DB, PostgreSQL, MySQL, MongoDB
 */

const { Client } = require('pg'); // For PostgreSQL/Neon DB
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

// Database configurations
const DATABASES = {
  // Neon DB - Ultron Data
  neondb: {
    type: 'postgres',
    enabled: true,
    connectionString: process.env.NEON_DB_URL,
    name: 'Neon DB - Ultron Data'
  }
};

// Track what tables to monitor for new entries
const MONITOR_TABLES = {
  // Example: monitor user signups, orders, etc.
  // Format: { table: 'table_name', timestampColumn: 'created_at', description: 'What this tracks' }
  users: {
    table: 'users',
    timestampColumn: 'created_at',
    description: 'New user signups',
    enabled: false
  },
  orders: {
    table: 'orders',
    timestampColumn: 'created_at',
    description: 'New orders',
    enabled: false
  },
  posts: {
    table: 'posts',
    timestampColumn: 'created_at',
    description: 'New posts/content',
    enabled: false
  }
};

async function connectToDatabase(dbConfig) {
  if (dbConfig.type === 'postgres') {
    const client = new Client({
      connectionString: dbConfig.connectionString,
      ssl: { rejectUnauthorized: false } // For Neon DB and cloud databases
    });
    await client.connect();
    return client;
  }

  throw new Error(`Unsupported database type: ${dbConfig.type}`);
}

async function getDatabaseStats(client, dbName) {
  console.log(`\n📊 ${dbName}`);
  console.log('─'.repeat(60));

  try {
    // Get database size
    const sizeResult = await client.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    console.log(`Database Size: ${sizeResult.rows[0].size}`);

    // Get connection count
    const connResult = await client.query(`
      SELECT count(*) as connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    console.log(`Active Connections: ${connResult.rows[0].connections}`);

    // Get table count
    const tableResult = await client.query(`
      SELECT count(*) as tables
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    console.log(`Total Tables: ${tableResult.rows[0].tables}`);

    return {
      size: sizeResult.rows[0].size,
      connections: connResult.rows[0].connections,
      tables: connResult.rows[0].tables
    };
  } catch (error) {
    console.error(`Error fetching stats: ${error.message}`);
    return null;
  }
}

async function getTableStats(client) {
  console.log(`\n📋 Table Statistics:`);

  try {
    const result = await client.query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);

    result.rows.forEach(row => {
      console.log(`  • ${row.tablename}: ${row.row_count} rows (${row.size})`);
    });

    return result.rows;
  } catch (error) {
    console.error(`Error fetching table stats: ${error.message}`);
    return [];
  }
}

async function checkNewEntries(client, timeWindow = '24 hours') {
  console.log(`\n🆕 New Entries (Last ${timeWindow}):`);

  const newEntries = {};
  let totalNew = 0;

  for (const [key, config] of Object.entries(MONITOR_TABLES)) {
    if (!config.enabled) continue;

    try {
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [config.table]);

      if (!tableExists.rows[0].exists) {
        console.log(`  ⚠️  Table '${config.table}' does not exist`);
        continue;
      }

      // Check for timestamp column
      const columnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = $1
          AND column_name = $2
        )
      `, [config.table, config.timestampColumn]);

      if (!columnExists.rows[0].exists) {
        console.log(`  ⚠️  Column '${config.timestampColumn}' does not exist in '${config.table}'`);
        continue;
      }

      // Count new entries
      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM ${config.table}
        WHERE ${config.timestampColumn} > NOW() - INTERVAL '${timeWindow}'
      `);

      const count = parseInt(result.rows[0].count);
      newEntries[key] = count;
      totalNew += count;

      if (count > 0) {
        console.log(`  ✅ ${config.description}: ${count} new`);
      }
    } catch (error) {
      console.log(`  ❌ Error checking ${config.table}: ${error.message}`);
    }
  }

  if (totalNew === 0) {
    console.log(`  No new entries in monitored tables`);
  }

  return newEntries;
}

async function getRecentActivity(client) {
  console.log(`\n⚡ Recent Database Activity:`);

  try {
    // Get recent queries (if pg_stat_statements extension is available)
    const result = await client.query(`
      SELECT
        query,
        calls,
        total_exec_time / 1000 as total_time_seconds,
        mean_exec_time / 1000 as avg_time_seconds
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat%'
      ORDER BY calls DESC
      LIMIT 5
    `).catch(() => null);

    if (result && result.rows.length > 0) {
      console.log(`  Top Queries by Call Count:`);
      result.rows.forEach((row, i) => {
        const query = row.query.substring(0, 60).replace(/\s+/g, ' ');
        console.log(`  ${i + 1}. ${query}...`);
        console.log(`     Calls: ${row.calls} | Avg time: ${row.avg_time_seconds.toFixed(2)}s`);
      });
    } else {
      console.log(`  pg_stat_statements extension not available`);
      console.log(`  Enable it with: CREATE EXTENSION pg_stat_statements;`);
    }
  } catch (error) {
    console.log(`  Unable to fetch activity: ${error.message}`);
  }
}

async function checkSlowQueries(client) {
  console.log(`\n🐌 Current Active Queries:`);

  try {
    const result = await client.query(`
      SELECT
        pid,
        usename,
        application_name,
        state,
        EXTRACT(EPOCH FROM (NOW() - query_start)) as duration,
        LEFT(query, 80) as query
      FROM pg_stat_activity
      WHERE state != 'idle'
        AND query NOT LIKE '%pg_stat_activity%'
        AND query_start IS NOT NULL
      ORDER BY query_start
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log(`  No active queries`);
    } else {
      result.rows.forEach(row => {
        const duration = row.duration.toFixed(2);
        console.log(`  • PID ${row.pid} (${row.state}) - ${duration}s`);
        console.log(`    ${row.query.replace(/\s+/g, ' ')}...`);
      });
    }
  } catch (error) {
    console.log(`  Unable to fetch active queries: ${error.message}`);
  }
}

async function generateReport(dbConfig) {
  const report = {
    database: dbConfig.name,
    stats: null,
    tables: [],
    newEntries: {},
    timestamp: new Date().toISOString()
  };

  try {
    const client = await connectToDatabase(dbConfig);

    report.stats = await getDatabaseStats(client, dbConfig.name);
    report.tables = await getTableStats(client);
    report.newEntries = await checkNewEntries(client, '24 hours');
    await getRecentActivity(client);
    await checkSlowQueries(client);

    await client.end();
  } catch (error) {
    console.error(`❌ Failed to connect to ${dbConfig.name}: ${error.message}`);
  }

  return report;
}

async function sendToSlack(message) {
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

    const data = await response.json();
    if (data.ok) {
      console.log('\n✅ Report sent to Slack');
    } else {
      console.log('\n⚠️  Slack send failed:', data.error);
    }
  } catch (error) {
    console.log('\n⚠️  Could not send to Slack:', error.message);
  }
}

function formatSlackReport(reports) {
  let message = '*📊 Database Monitoring Report*\n\n';

  reports.forEach(report => {
    if (!report.stats) {
      message += `❌ *${report.database}*\n`;
      message += `Connection failed\n\n`;
      return;
    }

    message += `*${report.database}*\n`;
    message += `• Size: ${report.stats.size}\n`;
    message += `• Tables: ${report.stats.tables}\n`;
    message += `• Connections: ${report.stats.connections}\n`;

    // New entries
    const totalNew = Object.values(report.newEntries).reduce((sum, count) => sum + count, 0);
    if (totalNew > 0) {
      message += `\n🆕 New Entries (24h):\n`;
      Object.entries(report.newEntries).forEach(([key, count]) => {
        if (count > 0) {
          const config = MONITOR_TABLES[key];
          message += `• ${config.description}: ${count}\n`;
        }
      });
    }

    message += `\n`;
  });

  message += `_Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST_`;

  return message;
}

async function main() {
  console.log('🔍 Database Monitor');
  console.log('═'.repeat(60));

  const enabledDatabases = Object.values(DATABASES).filter(db => db.enabled);

  if (enabledDatabases.length === 0) {
    console.log('\n⚠️  No databases configured!');
    console.log('\nTo enable database monitoring:');
    console.log('1. Add your database connection string to environment variables');
    console.log('2. Set enabled: true in the DATABASES configuration');
    console.log('3. Configure MONITOR_TABLES for tables you want to track');
    console.log('\nExample environment variables:');
    console.log('  export NEON_DB_URL="postgresql://user:pass@host/db"');
    console.log('  export POSTGRES_URL="postgresql://user:pass@host/db"');
    return;
  }

  const reports = [];

  for (const dbConfig of enabledDatabases) {
    const report = await generateReport(dbConfig);
    reports.push(report);
  }

  // Send to Slack
  const slackMessage = formatSlackReport(reports);
  console.log('\n' + '─'.repeat(60));
  console.log('Slack Report Preview:');
  console.log(slackMessage);

  await sendToSlack(slackMessage);

  console.log('\n✨ Database monitoring complete!');
}

main().catch(console.error);
