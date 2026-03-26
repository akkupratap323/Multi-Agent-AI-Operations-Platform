#!/usr/bin/env node

/**
 * Request Approval - Send email previews to Slack/WhatsApp for manual review
 *
 * Before sending any emails, this script:
 * 1. Sends email previews to Slack channel
 * 2. Sends WhatsApp message with preview link
 * 3. Waits for user approval (yes/no)
 * 4. Only proceeds when user explicitly approves
 */

const fs = require('fs');
const path = require('path');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || 'C0AFZ4RNNM6';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || ''; // Your WhatsApp number
const APPROVAL_FILE = path.join(__dirname, '../data/approval_status.json');

/**
 * Send email preview to Slack for approval
 */
async function sendSlackPreview(email, index, total) {
  const message = {
    channel: SLACK_CHANNEL,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📧 Email ${index + 1}/${total} - Approval Needed`,
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Company:*\n${email.prospect.companyName}`
          },
          {
            type: "mrkdwn",
            text: `*Industry:*\n${email.prospect.industry}`
          },
          {
            type: "mrkdwn",
            text: `*To:*\n${email.to}`
          },
          {
            type: "mrkdwn",
            text: `*Contact:*\n${email.prospect.contactName || 'Unknown'}`
          },
          {
            type: "mrkdwn",
            text: `*Fit Score:*\n${email.prospect.fitScore}/100`
          }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Subject:*\n\`\`\`${email.subject}\`\`\``
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Email Body:*\n\`\`\`${email.body.substring(0, 2900)}\`\`\``
        }
      },
      {
        type: "divider"
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Template: ${email.metadata.templateType} | Generated: ${new Date(email.metadata.generatedAt).toLocaleString()}`
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    const result = await response.json();
    if (result.ok) {
      return { success: true, ts: result.ts };
    } else {
      console.error(`Slack error: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`Failed to send to Slack:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send summary with approval buttons to Slack
 */
async function sendApprovalRequest(totalEmails, previewMessages) {
  const dataDir = path.join(__dirname, '../data');
  const readablePath = path.join(dataDir, 'emails_readable.txt');

  const message = {
    channel: SLACK_CHANNEL,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚀 Cold Email Campaign - Ready to Send",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Campaign Summary:*\n• Total emails to send: *${totalEmails}*\n• All emails reviewed above\n• Ready for your approval`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📎 Full email preview: \`${readablePath}\``
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Do you want to send these emails?*\n\n⚠️ This will send REAL emails to prospects!"
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Approve & Send",
              emoji: true
            },
            style: "primary",
            value: "approve",
            action_id: "approve_emails"
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "❌ Reject",
              emoji: true
            },
            style: "danger",
            value: "reject",
            action_id: "reject_emails"
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✏️ Edit Emails",
              emoji: true
            },
            value: "edit",
            action_id: "edit_emails"
          }
        ]
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `To approve via CLI: \`node scripts/approve_campaign.js approve\``
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error(`Failed to send approval request:`, error.message);
    return false;
  }
}

/**
 * Send WhatsApp notification (via API)
 * Replace with your WhatsApp Business API endpoint
 */
async function sendWhatsAppNotification(totalEmails) {
  if (!WHATSAPP_NUMBER) {
    console.log('   ⚠️  WhatsApp number not configured, skipping WhatsApp notification');
    return;
  }

  const message = `🚀 *Nester Sales Agent*

${totalEmails} cold emails are ready to send!

Check your Slack for email previews and approve/reject.

Reply "YES" to approve
Reply "NO" to reject
Reply "VIEW" to see details`;

  // TODO: Integrate with WhatsApp Business API
  // For now, just log the message
  console.log(`\n📱 WhatsApp notification (would send to ${WHATSAPP_NUMBER}):`);
  console.log(message);
  console.log('');
}

/**
 * Wait for approval (check approval file)
 */
async function waitForApproval(timeoutMinutes = 60) {
  console.log(`\n⏳ Waiting for approval (timeout: ${timeoutMinutes} minutes)...`);
  console.log('   Check your Slack or WhatsApp to approve/reject\n');

  const startTime = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;

  // Initialize approval file
  fs.writeFileSync(APPROVAL_FILE, JSON.stringify({
    status: 'pending',
    requestedAt: new Date().toISOString()
  }, null, 2));

  while (true) {
    // Check if timeout reached
    if (Date.now() - startTime > timeoutMs) {
      console.log('\n⏱️  Approval timeout reached. Campaign cancelled.');
      return { approved: false, reason: 'timeout' };
    }

    // Check approval file
    if (fs.existsSync(APPROVAL_FILE)) {
      const approval = JSON.parse(fs.readFileSync(APPROVAL_FILE, 'utf8'));

      if (approval.status === 'approved') {
        console.log('\n✅ Campaign APPROVED by user!');
        console.log(`   Approved at: ${approval.approvedAt}`);
        console.log(`   Approved by: ${approval.approvedBy || 'User'}\n`);
        return { approved: true, approval };
      }

      if (approval.status === 'rejected') {
        console.log('\n❌ Campaign REJECTED by user');
        console.log(`   Rejected at: ${approval.rejectedAt}`);
        console.log(`   Reason: ${approval.reason || 'User decision'}\n`);
        return { approved: false, reason: approval.reason };
      }
    }

    // Show waiting indicator
    process.stdout.write('.');

    // Wait 5 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

/**
 * Main execution
 */
async function requestApproval() {
  console.log('🔍 Nester Sales Agent - Approval Request\n');
  console.log('═'.repeat(60));

  // Load generated emails
  const emailsFile = path.join(__dirname, '../data/generated_emails.json');

  if (!fs.existsSync(emailsFile)) {
    console.error('\n❌ No generated emails found. Run email_generator.js first.');
    process.exit(1);
  }

  const emails = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));

  if (emails.length === 0) {
    console.log('\n⚠️  No emails to send.');
    process.exit(1);
  }

  console.log(`\n📧 Found ${emails.length} emails ready to send`);
  console.log('   Sending previews for approval...\n');

  // Send previews to Slack (show first 5 in detail, then summary)
  const previewCount = Math.min(5, emails.length);
  const previewMessages = [];

  console.log(`📤 Sending ${previewCount} email previews to Slack...\n`);

  for (let i = 0; i < previewCount; i++) {
    console.log(`   Sending preview ${i + 1}/${previewCount}...`);
    const result = await sendSlackPreview(emails[i], i, emails.length);

    if (result.success) {
      previewMessages.push(result.ts);
      console.log(`   ✅ Sent`);
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (emails.length > previewCount) {
    console.log(`\n   (${emails.length - previewCount} more emails not shown in preview)`);
  }

  console.log('\n' + '═'.repeat(60));

  // Send summary with approval buttons
  console.log('\n📤 Sending approval request...');
  const approvalSent = await sendApprovalRequest(emails.length, previewMessages);

  if (!approvalSent) {
    console.error('❌ Failed to send approval request');
    process.exit(1);
  }

  console.log('✅ Approval request sent to Slack');

  // Send WhatsApp notification
  await sendWhatsAppNotification(emails.length);

  console.log('\n' + '═'.repeat(60));

  // Wait for approval
  const result = await waitForApproval(60); // 60 minute timeout

  // Save result
  const resultFile = path.join(__dirname, '../data/approval_result.json');
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

  if (result.approved) {
    console.log('✅ Proceeding to send emails...\n');
    process.exit(0); // Success
  } else {
    console.log('❌ Campaign cancelled. No emails will be sent.\n');
    process.exit(1); // Failure
  }
}

// Handle CLI approval
if (process.argv.includes('approve')) {
  fs.writeFileSync(APPROVAL_FILE, JSON.stringify({
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy: 'CLI'
  }, null, 2));
  console.log('✅ Campaign approved via CLI');
  process.exit(0);
}

if (process.argv.includes('reject')) {
  fs.writeFileSync(APPROVAL_FILE, JSON.stringify({
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    reason: 'User rejected via CLI'
  }, null, 2));
  console.log('❌ Campaign rejected via CLI');
  process.exit(0);
}

requestApproval().catch(console.error);
