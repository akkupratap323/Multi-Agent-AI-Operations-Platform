#!/usr/bin/env node

/**
 * Simple Approval System - Send to Slack and check for text response
 *
 * Instead of buttons, just ask user to reply with "approve" or "reject"
 */

const fs = require('fs');
const path = require('path');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || 'C0AFZ4RNNM6';
const APPROVAL_FILE = path.join(__dirname, '../data/approval_status.json');

/**
 * Send simple approval request
 */
async function requestApproval() {
  console.log('📤 Sending approval request to Slack...\n');

  // Load emails
  const emailsFile = path.join(__dirname, '../data/generated_emails.json');
  const emails = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));

  // Send preview of first 3 emails
  for (let i = 0; i < Math.min(3, emails.length); i++) {
    const email = emails[i];

    const preview = `📧 *Email ${i + 1}/${emails.length}*

*To:* ${email.to}
*Company:* ${email.prospect.companyName}
*Industry:* ${email.prospect.industry}

*Subject:* ${email.subject}

*Body:*
\`\`\`
${email.body.substring(0, 500)}...
\`\`\`
`;

    await sendToSlack(preview);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Send approval request
  const approvalMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 *COLD EMAIL CAMPAIGN - APPROVAL REQUIRED*

📊 *Summary:*
• Total emails: *${emails.length}*
• Previewed: ${Math.min(3, emails.length)} emails above
• Ready to send!

⚠️ *To approve or reject, reply in this channel:*

✅ Type: \`approve\` or \`yes\` to SEND emails
❌ Type: \`reject\` or \`no\` to CANCEL

Or use CLI:
\`\`\`
cd /Users/apple/.openclaw/sales-agent
node scripts/approve_campaign.js approve
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏳ Waiting for your response...
`;

  await sendToSlack(approvalMessage);

  // Create approval status file
  fs.writeFileSync(APPROVAL_FILE, JSON.stringify({
    status: 'pending',
    requestedAt: new Date().toISOString(),
    emailCount: emails.length
  }, null, 2));

  console.log('✅ Approval request sent!');
  console.log('   Check your Slack and reply with "approve" or "reject"\n');
}

/**
 * Send message to Slack
 */
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

    const result = await response.json();
    if (!result.ok) {
      console.error('Slack error:', result.error);
    }
  } catch (error) {
    console.error('Failed to send to Slack:', error.message);
  }
}

requestApproval();
