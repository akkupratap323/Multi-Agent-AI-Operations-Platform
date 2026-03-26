#!/usr/bin/env node

/**
 * Slack Bot Server - Responds to messages in real-time
 *
 * This creates a local server that listens for Slack events
 * and responds to messages automatically
 */

const http = require('http');
const { execSync } = require('child_process');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';
const PORT = 3000;

// Store last seen message timestamp to avoid duplicates
let lastCheckedTime = Date.now() / 1000;

/**
 * Send message to Slack
 */
async function sendToSlack(message, threadTs = null) {
  try {
    const body = {
      channel: SLACK_CHANNEL,
      text: message
    };

    if (threadTs) {
      body.thread_ts = threadTs;
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error('Failed to send message:', error.message);
    return false;
  }
}

/**
 * Check for new messages
 */
async function checkMessages() {
  try {
    const response = await fetch(
      `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL}&oldest=${lastCheckedTime}&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`
        }
      }
    );

    const data = await response.json();

    if (!data.ok || !data.messages) {
      return;
    }

    // Process messages in reverse order (oldest first)
    const messages = data.messages.reverse();

    for (const message of messages) {
      const messageTime = parseFloat(message.ts);

      // Skip old messages
      if (messageTime <= lastCheckedTime) {
        continue;
      }

      // Skip bot's own messages
      if (message.bot_id) {
        continue;
      }

      // Update last checked time
      lastCheckedTime = messageTime;

      const text = (message.text || '').toLowerCase();

      console.log(`📨 New message: "${message.text}"`);

      // Handle different commands
      if (text === 'hello' || text === 'hi') {
        await sendToSlack(
          `👋 Hello! I'm the Nester Sales Agent bot.\n\n` +
          `I can help with:\n` +
          `• \`approve\` - Approve pending email campaign\n` +
          `• \`reject\` - Reject pending email campaign\n` +
          `• \`status\` - Check campaign status\n` +
          `• \`help\` - Show this message`,
          message.ts
        );
      }
      else if (text === 'approve' || text === 'yes' || text === 'send') {
        // Approve campaign
        execSync('node /Users/apple/.openclaw/sales-agent/scripts/approve_campaign.js approve');
        await sendToSlack(
          `✅ *Campaign APPROVED!*\n\nEmails will be sent in the next scheduler cycle (within 5 minutes).`,
          message.ts
        );
      }
      else if (text === 'reject' || text === 'no' || text === 'cancel') {
        // Reject campaign
        execSync('node /Users/apple/.openclaw/sales-agent/scripts/approve_campaign.js reject');
        await sendToSlack(
          `❌ *Campaign REJECTED*\n\nNo emails will be sent.`,
          message.ts
        );
      }
      else if (text === 'status') {
        // Check status
        const { existsSync, readFileSync } = require('fs');
        const approvalFile = '/Users/apple/.openclaw/sales-agent/data/approval_status.json';

        if (existsSync(approvalFile)) {
          const approval = JSON.parse(readFileSync(approvalFile, 'utf8'));
          await sendToSlack(
            `📊 *Campaign Status*\n\n` +
            `Status: ${approval.status}\n` +
            `Emails ready: ${approval.emailCount || 'unknown'}\n` +
            `Requested: ${new Date(approval.requestedAt).toLocaleString()}`,
            message.ts
          );
        } else {
          await sendToSlack(
            `📊 *Campaign Status*\n\nNo pending campaigns.`,
            message.ts
          );
        }
      }
      else if (text === 'help') {
        await sendToSlack(
          `🤖 *Nester Sales Agent Bot - Commands*\n\n` +
          `• \`hello\` - Say hi\n` +
          `• \`approve\` - Approve pending emails\n` +
          `• \`reject\` - Reject pending emails\n` +
          `• \`status\` - Check campaign status\n` +
          `• \`help\` - Show this message`,
          message.ts
        );
      }
      else {
        // Unknown command
        await sendToSlack(
          `🤔 I didn't understand that. Type \`help\` to see available commands.`,
          message.ts
        );
      }
    }
  } catch (error) {
    console.error('Error checking messages:', error.message);
  }
}

/**
 * Start polling for messages
 */
function startBot() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🤖 SLACK BOT SERVER - STARTED                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`✅ Bot: terrrorizer_ai`);
  console.log(`📱 Channel: ${SLACK_CHANNEL}`);
  console.log(`🔄 Polling every 2 seconds\n`);
  console.log(`💬 Try messaging in Slack:`);
  console.log(`   - hello`);
  console.log(`   - approve`);
  console.log(`   - status\n`);
  console.log(`🛑 Press Ctrl+C to stop\n`);
  console.log('━'.repeat(80) + '\n');

  // Poll for messages every 2 seconds
  setInterval(checkMessages, 2000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Bot stopped by user');
  process.exit(0);
});

// Start the bot
startBot();
