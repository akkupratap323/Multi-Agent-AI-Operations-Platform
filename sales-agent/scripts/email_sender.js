#!/usr/bin/env node

/**
 * Email Sender - Sends approved emails via Gmail API
 */

const fs = require('fs');
const path = require('path');
const { sendEmail, sendBatch } = require('./lib/gmail_sender');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OPENCLAW = process.env.HOME ? path.join(process.env.HOME, '.openclaw') : path.join(__dirname, '..', '..', '..');
const DAILY_LIMIT = 50;
const DELAY_MS = 5000;

function checkGmailSetup() {
  if (!process.env.HOME) {
    console.error('❌ HOME environment variable is not set.');
    return false;
  }
  const tokenPath = path.join(OPENCLAW, 'google-token.json');
  const credsPath = path.join(OPENCLAW, 'gmail-credentials.json');
  if (!fs.existsSync(credsPath)) {
    console.error('❌ Gmail credentials not found:', credsPath);
    console.error('   Add gmail-credentials.json (from Google Cloud Console) to ~/.openclaw/');
    return false;
  }
  if (!fs.existsSync(tokenPath)) {
    console.error('❌ Gmail token not found:', tokenPath);
    console.error('   Run: node ~/.openclaw/authorize-google.js');
    return false;
  }
  return true;
}

/** Basic email validation - skip obvious non-emails (e.g. scraped .webp, data URIs) */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  // Must look like local@domain
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  // Reject common non-email patterns
  if (/\.(webp|png|jpg|jpeg|gif|svg|pdf|css|js)(\?|$)/i.test(e)) return false;
  if (e.includes('data:') || e.startsWith('http')) return false;
  if (e.length > 254) return false;
  return true;
}

async function sendApprovedEmails() {
  const emailsFile = path.join(DATA_DIR, 'generated_emails.json');
  const approvalFile = path.join(DATA_DIR, 'approval_status.json');

  if (!fs.existsSync(emailsFile)) {
    console.error('❌ No generated emails found.');
    return null;
  }

  // Check approval
  if (fs.existsSync(approvalFile)) {
    const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
    if (approval.status !== 'approved') {
      console.log('⚠️ Campaign not approved yet. Status:', approval.status);
      return null;
    }
  }

  if (!checkGmailSetup()) {
    return null;
  }

  const emails = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));
  const withContent = emails.filter(e => e.to && e.subject && e.body);
  const validEmails = withContent.filter(e => {
    if (!isValidEmail(e.to)) {
      console.warn(`⚠️ Skipping invalid address: ${e.to}`);
      return false;
    }
    return true;
  });

  if (validEmails.length === 0) {
    console.error('❌ No valid emails to send (all skipped or missing to/subject/body).');
    return null;
  }
  if (validEmails.length < withContent.length) {
    console.log(`📋 Filtered to ${validEmails.length} valid of ${withContent.length} (skipped ${withContent.length - validEmails.length} invalid).`);
  }

  console.log(`📤 Sending ${validEmails.length} emails via Gmail API...\n`);

  let results;
  try {
    results = await sendBatch(
      validEmails.map(e => ({
        to: e.to,
        subject: e.subject,
        body: e.body
      })),
      DELAY_MS,
      DAILY_LIMIT
    );
  } catch (err) {
    console.error('\n❌ Send failed:', err.message);
    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.error('   → Check internet connection and that oauth2.googleapis.com is reachable.');
    }
    if (err.message.includes('invalid_grant') || err.message.includes('Token has been expired')) {
      console.error('   → Re-run: node ~/.openclaw/authorize-google.js to refresh Gmail token.');
    }
    throw err;
  }

  // Save send results (don't crash if data dir is read-only)
  const sendResults = {
    sentAt: new Date().toISOString(),
    total: results.total,
    sent: results.sent,
    failed: results.failed,
    results: results.results
  };

  try {
    fs.writeFileSync(path.join(DATA_DIR, 'send_results.json'), JSON.stringify(sendResults, null, 2));
  } catch (err) {
    console.warn('⚠️ Could not write send_results.json:', err.message);
  }

  try {
    if (fs.existsSync(approvalFile)) {
      const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
      approval.status = 'sent';
      approval.sentAt = new Date().toISOString();
      approval.sentCount = results.sent;
      fs.writeFileSync(approvalFile, JSON.stringify(approval, null, 2));
    }
  } catch (err) {
    console.warn('⚠️ Could not update approval_status.json:', err.message);
  }

  console.log(`\n📊 Send Results:`);
  console.log(`  Total: ${results.total}`);
  console.log(`  Sent: ${results.sent}`);
  console.log(`  Failed: ${results.failed}`);

  return sendResults;
}

function formatResultsForSlack(results) {
  if (!results) return '❌ No send results available.';

  let msg = `📤 *Email Send Results*\n\n`;
  msg += `✅ Sent: ${results.sent}\n`;
  msg += `❌ Failed: ${results.failed}\n`;
  msg += `📊 Total: ${results.total}\n\n`;

  if (results.results) {
    const successful = results.results.filter(r => r.success);
    const failed = results.results.filter(r => !r.success);

    if (successful.length > 0) {
      msg += `*Successfully Sent:*\n`;
      successful.slice(0, 5).forEach(r => {
        msg += `  ✅ ${r.to}\n`;
      });
      if (successful.length > 5) {
        msg += `  ...and ${successful.length - 5} more\n`;
      }
      msg += '\n';
    }

    if (failed.length > 0) {
      msg += `*Failed:*\n`;
      failed.forEach(r => {
        msg += `  ❌ ${r.to}: ${r.error}\n`;
      });
    }
  }

  return msg;
}

module.exports = { sendApprovedEmails, formatResultsForSlack };

if (require.main === module) {
  sendApprovedEmails()
    .then(results => {
      if (results) {
        console.log('\n' + formatResultsForSlack(results));
      }
    })
    .catch(err => {
      console.error('\n❌ Pipeline error:', err.message);
      process.exit(1);
    });
}
