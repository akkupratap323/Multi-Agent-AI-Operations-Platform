#!/usr/bin/env node

/**
 * Gmail API Email Sender
 * Sends emails via Gmail API using existing OAuth2 credentials
 */

const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(process.env.HOME, '.openclaw', 'google-token.json');
const CREDENTIALS_PATH = path.join(process.env.HOME, '.openclaw', 'gmail-credentials.json');

let gmailInstance = null;

async function getGmailClient() {
  if (gmailInstance) return gmailInstance;

  const { google } = require(path.join(process.env.HOME, '.openclaw', 'node_modules', 'googleapis'));

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

  const { client_id, client_secret } = credentials.installed || credentials.web || {};
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
  oauth2Client.setCredentials(token);

  gmailInstance = google.gmail({ version: 'v1', auth: oauth2Client });
  return gmailInstance;
}

/**
 * Create RFC 2822 raw email message
 */
function createRawMessage({ to, subject, body, from = 'Aditya <aditya@nesterlabs.com>' }) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    body
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

/**
 * Send an email via Gmail API
 */
async function sendEmail({ to, subject, body, from }) {
  try {
    const gmail = await getGmailClient();
    const raw = createRawMessage({ to, subject, body, from });

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    console.log(`✅ Email sent to ${to} (ID: ${result.data.id})`);
    return {
      success: true,
      messageId: result.data.id,
      threadId: result.data.threadId,
      to,
      subject
    };
  } catch (error) {
    console.error(`❌ Failed to send to ${to}:`, error.message);
    return {
      success: false,
      error: error.message,
      to,
      subject
    };
  }
}

/**
 * Send multiple emails with rate limiting
 */
async function sendBatch(emails, delayMs = 5000, dailyLimit = 50) {
  const results = [];
  let sent = 0;

  for (const email of emails) {
    if (sent >= dailyLimit) {
      console.log(`⚠️ Daily limit reached (${dailyLimit}). Stopping.`);
      break;
    }

    const result = await sendEmail(email);
    results.push(result);

    if (result.success) sent++;

    // Rate limit delay
    if (emails.indexOf(email) < emails.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: emails.length,
    sent,
    failed: results.filter(r => !r.success).length,
    results
  };
}

module.exports = {
  sendEmail,
  sendBatch,
  getGmailClient
};
