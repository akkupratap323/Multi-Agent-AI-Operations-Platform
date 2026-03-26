#!/usr/bin/env node

/**
 * Test Slack Messages - Check if we can read messages from Slack
 */

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

async function testSlackMessages() {
  console.log('🔍 Testing Slack message reading...\n');
  console.log(`Channel: ${SLACK_CHANNEL}\n`);

  try {
    const response = await fetch(
      `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL}&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error('❌ Slack API Error:', data.error);
      return;
    }

    console.log(`✅ Successfully fetched ${data.messages.length} messages\n`);
    console.log('Recent messages:');
    console.log('━'.repeat(60));

    data.messages.slice(0, 10).forEach((msg, i) => {
      const time = new Date(parseFloat(msg.ts) * 1000).toLocaleString();
      const text = msg.text || '[no text]';
      const user = msg.user || msg.bot_id || 'unknown';
      const isBot = msg.bot_id ? '🤖' : '👤';

      console.log(`\n${i + 1}. ${isBot} ${time}`);
      console.log(`   User: ${user}`);
      console.log(`   Text: ${text.substring(0, 100)}`);
    });

    console.log('\n' + '━'.repeat(60));

    // Check for approval keywords
    console.log('\n🔍 Checking for approval keywords...\n');

    for (const msg of data.messages) {
      if (msg.bot_id) continue; // Skip bot messages

      const text = (msg.text || '').toLowerCase();

      if (text.includes('approve') || text.includes('yes') || text === 'yes') {
        console.log('✅ Found APPROVAL message:');
        console.log(`   "${msg.text}"`);
        console.log(`   By: ${msg.user}`);
        console.log(`   Time: ${new Date(parseFloat(msg.ts) * 1000).toLocaleString()}`);
        return;
      }

      if (text.includes('reject') || text.includes('no')) {
        console.log('❌ Found REJECTION message:');
        console.log(`   "${msg.text}"`);
        console.log(`   By: ${msg.user}`);
        console.log(`   Time: ${new Date(parseFloat(msg.ts) * 1000).toLocaleString()}`);
        return;
      }
    }

    console.log('⚠️  No approval/rejection keywords found');
    console.log('   Looking for: approve, yes, reject, no');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSlackMessages();
