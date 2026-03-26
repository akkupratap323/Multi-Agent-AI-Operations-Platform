#!/usr/bin/env node

/**
 * Check Slack for Approval - Single check (used by scheduler)
 */

const fs = require('fs');
const path = require('path');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || 'C0AFZ4RNNM6';
const APPROVAL_FILE = path.join(__dirname, '../data/approval_status.json');

async function checkApproval() {
  // Check if we're waiting for approval
  if (!fs.existsSync(APPROVAL_FILE)) {
    console.log('No approval pending');
    process.exit(1);
  }

  const approval = JSON.parse(fs.readFileSync(APPROVAL_FILE, 'utf8'));

  if (approval.status !== 'pending') {
    console.log(`Approval status: ${approval.status}`);
    process.exit(approval.status === 'approved' ? 0 : 1);
  }

  // Get recent Slack messages
  try {
    const response = await fetch(
      `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL}&limit=20`,
      {
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`
        }
      }
    );

    const data = await response.json();

    if (!data.ok || !data.messages) {
      console.log('Failed to fetch Slack messages');
      process.exit(1);
    }

    const requestTime = new Date(approval.requestedAt).getTime() / 1000;

    // Check messages after approval request
    for (const message of data.messages) {
      if (parseFloat(message.ts) < requestTime) continue;
      if (message.bot_id) continue;

      const text = (message.text || '').toLowerCase();

      if (text.includes('approve') || text.includes('yes') || text.includes('send')) {
        // Approved!
        const approvedStatus = {
          status: 'approved',
          approvedAt: new Date().toISOString(),
          approvedBy: message.user || 'Slack User'
        };

        fs.writeFileSync(APPROVAL_FILE, JSON.stringify(approvedStatus, null, 2));

        // Send acknowledgment
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            channel: SLACK_CHANNEL,
            text: '✅ *Campaign APPROVED!* Emails will be sent now.'
          })
        });

        console.log('✅ Approved!');
        process.exit(0);
      }

      if (text.includes('reject') || text.includes('no') || text.includes('cancel')) {
        // Rejected!
        const rejectedStatus = {
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectedBy: message.user || 'Slack User'
        };

        fs.writeFileSync(APPROVAL_FILE, JSON.stringify(rejectedStatus, null, 2));

        // Send acknowledgment
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            channel: SLACK_CHANNEL,
            text: '❌ *Campaign REJECTED.* No emails will be sent.'
          })
        });

        console.log('❌ Rejected');
        process.exit(1);
      }
    }

    console.log('Still waiting for approval');
    process.exit(1);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkApproval();
