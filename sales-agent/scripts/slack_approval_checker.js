#!/usr/bin/env node

/**
 * Slack Approval Checker - Monitor Slack for approval responses
 *
 * Polls Slack channel for messages containing "approve" or "reject"
 * Updates approval status file when user responds
 */

const fs = require('fs');
const path = require('path');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || 'C0AFZ4RNNM6';
const APPROVAL_FILE = path.join(__dirname, '../data/approval_status.json');
const CHECK_INTERVAL = 5000; // Check every 5 seconds

let lastCheckedTimestamp = null;

/**
 * Get recent messages from Slack channel
 */
async function getRecentMessages() {
  try {
    const url = `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL}&limit=10`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.ok && data.messages) {
      return data.messages;
    } else {
      console.error('Slack API error:', data.error);
      return [];
    }
  } catch (error) {
    console.error('Failed to fetch messages:', error.message);
    return [];
  }
}

/**
 * Check messages for approval/rejection
 */
function checkForApproval(messages) {
  // Get current approval request timestamp
  if (!fs.existsSync(APPROVAL_FILE)) {
    return null;
  }

  const approval = JSON.parse(fs.readFileSync(APPROVAL_FILE, 'utf8'));
  const requestTime = new Date(approval.requestedAt).getTime() / 1000;

  // Look for messages after the approval request
  for (const message of messages) {
    // Skip messages older than the approval request
    if (parseFloat(message.ts) < requestTime) {
      continue;
    }

    // Skip bot messages
    if (message.bot_id) {
      continue;
    }

    const text = (message.text || '').toLowerCase();

    // Check for approval keywords
    if (text.includes('approve') || text.includes('yes') || text.includes('send')) {
      return {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: message.user || 'Slack User',
        message: message.text
      };
    }

    // Check for rejection keywords
    if (text.includes('reject') || text.includes('no') || text.includes('cancel')) {
      return {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectedBy: message.user || 'Slack User',
        reason: message.text
      };
    }
  }

  return null;
}

/**
 * Send acknowledgment to Slack
 */
async function sendAcknowledgment(status) {
  const message = status === 'approved'
    ? '✅ *Campaign Approved!* Emails will be sent in the next cycle.'
    : '❌ *Campaign Rejected.* No emails will be sent.';

  try {
    await fetch('https://slack.com/api/chat.postMessage', {
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
  } catch (error) {
    console.error('Failed to send acknowledgment:', error.message);
  }
}

/**
 * Main monitoring loop
 */
async function monitorSlack() {
  console.log('👀 Monitoring Slack for approval responses...');
  console.log('   Reply in Slack with:');
  console.log('   - "approve" or "yes" to approve');
  console.log('   - "reject" or "no" to reject\n');

  setInterval(async () => {
    // Check if we're waiting for approval
    if (!fs.existsSync(APPROVAL_FILE)) {
      return;
    }

    const approval = JSON.parse(fs.readFileSync(APPROVAL_FILE, 'utf8'));

    if (approval.status !== 'pending') {
      return;
    }

    // Get recent messages
    const messages = await getRecentMessages();
    const response = checkForApproval(messages);

    if (response) {
      console.log(`\n${response.status === 'approved' ? '✅' : '❌'} Campaign ${response.status}!`);
      console.log(`   By: ${response.approvedBy || response.rejectedBy}`);
      console.log(`   Message: ${response.message || response.reason}\n`);

      // Update approval status
      fs.writeFileSync(APPROVAL_FILE, JSON.stringify(response, null, 2));

      // Send acknowledgment
      await sendAcknowledgment(response.status);
    } else {
      process.stdout.write('.');
    }
  }, CHECK_INTERVAL);
}

// Start monitoring
monitorSlack();
