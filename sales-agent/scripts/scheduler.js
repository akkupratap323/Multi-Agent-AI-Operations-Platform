#!/usr/bin/env node

/**
 * Sales Agent Scheduler - Run campaigns automatically
 *
 * This script runs the sales agent on a schedule:
 * - Researches new prospects
 * - Finds emails
 * - Generates personalized emails
 * - Requests approval via Slack
 * - Sends emails after approval
 *
 * Runs every 5 minutes (configurable)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = __dirname;
const dataDir = path.join(scriptsDir, '../data');

// Configuration
const SCHEDULE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const RUN_IMMEDIATELY = true; // Run once on startup
const MAX_EMAILS_PER_RUN = 10; // Limit emails per cycle

/**
 * Log with timestamp
 */
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Run a script and return result
 */
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(scriptsDir, scriptName);
    const child = spawn('node', [scriptPath], {
      stdio: 'pipe',
      cwd: scriptsDir
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        reject(new Error(`${scriptName} failed: ${errorOutput || output}`));
      }
    });
  });
}

/**
 * Check if there are pending emails waiting for approval
 */
function hasPendingApproval() {
  const approvalFile = path.join(dataDir, 'approval_status.json');

  if (fs.existsSync(approvalFile)) {
    const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
    return approval.status === 'pending';
  }

  return false;
}

/**
 * Check if approval was granted
 */
function isApprovalGranted() {
  const approvalFile = path.join(dataDir, 'approval_status.json');

  if (fs.existsSync(approvalFile)) {
    const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
    return approval.status === 'approved';
  }

  return false;
}

/**
 * Clear approval status for next run
 */
function clearApprovalStatus() {
  const approvalFile = path.join(dataDir, 'approval_status.json');
  const approvalResultFile = path.join(dataDir, 'approval_result.json');

  if (fs.existsSync(approvalFile)) {
    fs.unlinkSync(approvalFile);
  }
  if (fs.existsSync(approvalResultFile)) {
    fs.unlinkSync(approvalResultFile);
  }
}

/**
 * Get campaign statistics
 */
function getCampaignStats() {
  const reportFiles = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('campaign_report_'))
    .sort()
    .reverse();

  if (reportFiles.length > 0) {
    const latestReport = JSON.parse(
      fs.readFileSync(path.join(dataDir, reportFiles[0]), 'utf8')
    );
    return latestReport;
  }

  return null;
}

/**
 * Send status update to Slack
 */
async function sendStatusToSlack(status, details = {}) {
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
  const SLACK_CHANNEL = process.env.SLACK_CHANNEL || 'C0AFZ4RNNM6';

  let message = `🤖 *Sales Agent Scheduler Update*\n\n`;

  if (status === 'running') {
    message += `⚙️ *Status:* Campaign cycle started\n`;
    message += `🕐 *Time:* ${new Date().toLocaleString()}\n`;
  } else if (status === 'completed') {
    message += `✅ *Status:* Campaign cycle completed\n`;
    message += `📧 *Emails ready:* ${details.emailCount || 0}\n`;
    message += `⏰ *Next run:* In 5 minutes\n`;
  } else if (status === 'approved_sending') {
    message += `🚀 *Status:* Approval granted - Sending emails!\n`;
    message += `📤 *Sending:* ${details.emailCount || 0} emails\n`;
  } else if (status === 'sent') {
    message += `✅ *Status:* Emails sent successfully!\n`;
    message += `📊 *Sent:* ${details.sent || 0}\n`;
    message += `❌ *Failed:* ${details.failed || 0}\n`;
    message += `📈 *Success rate:* ${details.successRate || 0}%\n`;
  } else if (status === 'error') {
    message += `❌ *Status:* Error occurred\n`;
    message += `⚠️ *Error:* ${details.error}\n`;
  }

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
    log(`Failed to send Slack update: ${error.message}`);
  }
}

/**
 * Run one campaign cycle
 */
async function runCampaignCycle() {
  log('━'.repeat(80));
  log('🚀 Starting campaign cycle');
  log('━'.repeat(80));

  try {
    // Check if we have pending approval from previous run
    if (hasPendingApproval()) {
      log('⏸️  Pending approval from previous run - checking status...');

      if (isApprovalGranted()) {
        log('✅ Approval granted! Proceeding to send emails...');

        await sendStatusToSlack('approved_sending', {
          emailCount: getEmailCount()
        });

        // Send emails
        const sendResult = await runScript('email_sender.js');
        log('✅ Emails sent successfully');

        // Get stats and notify
        const stats = getCampaignStats();
        if (stats) {
          await sendStatusToSlack('sent', {
            sent: stats.totalSent,
            failed: stats.totalFailed,
            successRate: ((stats.totalSent / (stats.totalSent + stats.totalFailed)) * 100).toFixed(1)
          });
        }

        // Clear approval for next run
        clearApprovalStatus();
      } else {
        log('⏳ Still waiting for approval - skipping this cycle');
      }

      return;
    }

    // No pending approval - run new campaign cycle
    await sendStatusToSlack('running');

    // Stage 1: Research prospects
    log('🔍 Stage 1: Researching prospects...');
    await runScript('research_prospects.js');
    log('✅ Research complete');

    // Stage 2: Find emails
    log('📧 Stage 2: Finding emails...');
    await runScript('email_finder.js');
    log('✅ Email finding complete');

    // Stage 3: Generate emails
    log('✏️  Stage 3: Generating personalized emails...');
    await runScript('email_generator.js');
    log('✅ Email generation complete');

    const emailCount = getEmailCount();

    if (emailCount === 0) {
      log('⚠️  No emails generated - skipping approval request');
      return;
    }

    // Stage 4: Request approval
    log(`📤 Stage 4: Requesting approval for ${emailCount} emails...`);

    // Don't wait for approval - let it run in background
    const approvalProcess = spawn('node', [path.join(scriptsDir, 'request_approval.js')], {
      stdio: 'ignore',
      detached: true,
      cwd: scriptsDir
    });
    approvalProcess.unref();

    log(`✅ Approval request sent to Slack for ${emailCount} emails`);
    log('⏳ Waiting for user approval (will send on next cycle if approved)');

    await sendStatusToSlack('completed', { emailCount });

  } catch (error) {
    log(`❌ Error in campaign cycle: ${error.message}`);
    await sendStatusToSlack('error', { error: error.message });
  }

  log('━'.repeat(80));
  log(`⏰ Next cycle in ${SCHEDULE_INTERVAL / 60000} minutes`);
  log('━'.repeat(80) + '\n');
}

/**
 * Get number of emails ready to send
 */
function getEmailCount() {
  const emailsFile = path.join(dataDir, 'generated_emails.json');
  if (fs.existsSync(emailsFile)) {
    const emails = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));
    return emails.length;
  }
  return 0;
}

/**
 * Main scheduler
 */
async function startScheduler() {
  log('╔═══════════════════════════════════════════════════════════════════════════╗');
  log('║              🤖 SALES AGENT SCHEDULER - STARTED                          ║');
  log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  log(`📅 Schedule: Every ${SCHEDULE_INTERVAL / 60000} minutes`);
  log(`📧 Max emails per run: ${MAX_EMAILS_PER_RUN}`);
  log(`🚀 Run immediately: ${RUN_IMMEDIATELY ? 'Yes' : 'No'}\n`);

  // Run immediately on startup
  if (RUN_IMMEDIATELY) {
    await runCampaignCycle();
  }

  // Schedule recurring runs
  setInterval(async () => {
    await runCampaignCycle();
  }, SCHEDULE_INTERVAL);

  log('✅ Scheduler is running. Press Ctrl+C to stop.\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n👋 Scheduler stopped by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('\n👋 Scheduler terminated');
  process.exit(0);
});

// Start the scheduler
startScheduler().catch((error) => {
  log(`❌ Scheduler error: ${error.message}`);
  process.exit(1);
});
