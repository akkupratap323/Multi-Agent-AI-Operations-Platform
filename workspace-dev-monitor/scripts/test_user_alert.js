#!/usr/bin/env node

/**
 * Test User Alert - Simulates finding new users and sends alert
 */

const { Client } = require('pg');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';
const CONNECTION_STRING = process.env.NEON_DB_URL;

async function sendAlertToSlack(projectName, tableName, data) {
  let message = `🎉 *New Users Detected* (Test)\n\n`;
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
      console.log(`✅ Alert sent to Slack`);
    } else {
      console.log(`⚠️  Slack send failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not send to Slack: ${error.message}`);
  }
}

async function main() {
  console.log('🧪 Testing User Alert System\n');

  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('✅ Connected to Ultron database\n');

  // Get most recent 5 users (to test the alert)
  const result = await client.query(`
    SELECT "id", "email", "username", "displayName", "createdAt"
    FROM "users"
    ORDER BY "createdAt" DESC
    LIMIT 5
  `);

  console.log(`Found ${result.rows.length} users in database`);

  if (result.rows.length > 0) {
    // Get total count
    const totalResult = await client.query('SELECT COUNT(*) as count FROM "users"');
    const totalCount = parseInt(totalResult.rows[0].count);

    console.log(`Total users: ${totalCount}\n`);
    console.log('Most recent users:');
    result.rows.forEach((user, i) => {
      console.log(`  ${i + 1}. ${user.displayName} (${user.email})`);
      console.log(`     Username: ${user.username} | ID: ${user.id} | Joined: ${new Date(user.createdAt).toLocaleDateString()}`);
    });

    // Send test alert with these users
    console.log('\n📤 Sending test alert to Slack...\n');

    const alertData = {
      count: result.rows.length,
      users: result.rows,
      columns: ['id', 'email', 'username', 'displayName'],
      timestampColumn: 'createdAt'
    };

    await sendAlertToSlack('Ultron', 'users', alertData);
  } else {
    console.log('No users found in database');
  }

  await client.end();
  console.log('\n✨ Test complete!');
}

main().catch(console.error);
