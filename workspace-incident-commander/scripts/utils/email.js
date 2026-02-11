#!/usr/bin/env node

/**
 * Gmail delivery utility for incident notifications
 * Reuses existing Google OAuth setup from authorize-google.js
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Send an incident email via Gmail API
 */
async function sendIncidentEmail(to, subject, body) {
  try {
    const { google } = require('/Users/apple/.openclaw/node_modules/googleapis');

    // Load saved credentials
    if (!fs.existsSync(config.GMAIL_TOKEN)) {
      console.error('Gmail token not found. Run authorize-google.js first.');
      return false;
    }

    const tokenData = JSON.parse(fs.readFileSync(config.GMAIL_TOKEN, 'utf8'));
    const credentialsData = JSON.parse(fs.readFileSync(config.GMAIL_CREDENTIALS, 'utf8'));

    const credentials = credentialsData.installed || credentialsData.web;
    const oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uris[0]
    );
    oauth2Client.setCredentials(tokenData);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build RFC 2822 email
    const toList = Array.isArray(to) ? to.join(', ') : to;
    const rawEmail = [
      `To: ${toList}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n');

    const encodedEmail = Buffer.from(rawEmail).toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedEmail }
    });

    console.log(`Email sent to ${toList}`);
    return true;
  } catch (error) {
    console.error('Email send failed:', error.message);
    return false;
  }
}

/**
 * Format an incident as an email
 */
function formatIncidentEmail(incident) {
  const subject = `[${incident.severity}] Incident ${incident.incidentNumber} - ${incident.serviceType}/${incident.resourceId}`;

  const body = [
    `INCIDENT REPORT: ${incident.incidentNumber}`,
    `Severity: ${incident.severity}`,
    `Status: ${incident.status}`,
    '',
    `Service: ${incident.serviceType}`,
    `Resource: ${incident.resourceId}`,
    `Metric: ${incident.metric} = ${incident.metricValue} (threshold: ${incident.thresholdValue})`,
    '',
    `Root Cause (${Math.round((incident.confidence || 0) * 100)}% confidence):`,
    incident.rootCause || 'Under investigation',
    '',
    `Suggested Fixes:`,
    ...(incident.suggestedFixes || []).map((fix, i) => `  ${i + 1}. ${fix.description}`),
    '',
    `Detected: ${new Date(incident.detectedAt || Date.now()).toLocaleString('en-US', { timeZone: config.TIMEZONE })} IST`,
    '',
    'Check Slack for the war room channel and approval workflow.',
    '',
    '-- Incident Commander (OpenClaw)'
  ].join('\n');

  return { subject, body };
}

module.exports = { sendIncidentEmail, formatIncidentEmail };
