#!/usr/bin/env node

/**
 * Incident Commander — Configuration
 * All values loaded from environment variables (.env file).
 * NEVER hardcode secrets here.
 */

const path = require('path');

// Load .env from workspace root
require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

module.exports = {
  // Slack
  SLACK_BOT_TOKEN:       required('SLACK_BOT_TOKEN'),
  SLACK_ALERTS_CHANNEL:  null,
  SLACK_FALLBACK_CHANNEL: optional('SLACK_FALLBACK_CHANNEL', ''),

  // Neon DB
  NEON_DB_URL: required('NEON_DB_URL'),

  // OpenAI (Primary LLM)
  OPENAI_API_KEY: optional('OPENAI_API_KEY'),
  OPENAI_MODEL:   optional('OPENAI_MODEL', 'gpt-4o'),

  // Gemini (Fallback LLM)
  GEMINI_API_KEY: optional('GEMINI_API_KEY'),
  GEMINI_MODEL:   optional('GEMINI_MODEL', 'gemini-2.5-flash'),

  // WhatsApp
  WHATSAPP_TO: optional('WHATSAPP_TO'),

  // Gmail
  GMAIL_CREDENTIALS: optional('GMAIL_CREDENTIALS', '/Users/apple/.openclaw/gmail-credentials.json'),
  GMAIL_TOKEN:       optional('GMAIL_TOKEN', '/Users/apple/.openclaw/google-token.json'),
  STAKEHOLDER_EMAILS: optional('STAKEHOLDER_EMAILS', '').split(',').filter(Boolean),

  // AWS
  AWS_REGION: optional('AWS_REGION', 'us-west-2'),

  // GitHub repos to check for recent commits during diagnosis
  GITHUB_REPOS: optional('GITHUB_REPOS', '').split(',').filter(Boolean),

  // Severity thresholds
  THRESHOLDS: {
    lightsail: {
      CPUUtilization:             { p1: 95, p2: 85, p3: 75 },
      StatusCheckFailed:          { p1: 1 },
      StatusCheckFailed_Instance: { p1: 1 },
      StatusCheckFailed_System:   { p1: 1 },
      BurstCapacityPercentage:    { p1: 10, p2: 20, p3: 30 }
    },
    lightsail_db: {
      CPUUtilization:      { p1: 95, p2: 85, p3: 75 },
      DatabaseConnections: { p1: 90, p2: 70, p3: 50 }
    },
    ec2: {
      CPUUtilization:    { p1: 95, p2: 85, p3: 75 },
      StatusCheckFailed: { p1: 1 }
    }
  },

  // Metrics where LOWER value = worse (invert comparison)
  INVERTED_METRICS: ['BurstCapacityPercentage'],

  // Cooldown: don't re-alert same service+metric within N minutes
  ALERT_COOLDOWN_MINUTES: 10,

  // Approval polling
  APPROVAL_POLL_INTERVAL_MS: 15000,
  APPROVAL_TIMEOUT_MINUTES:  30,

  // Health check wait after fix
  HEALTH_CHECK_DELAY_MS: 60000,

  // Paths
  WORKSPACE:     path.join(__dirname, '..'),
  INCIDENTS_DIR: path.join(__dirname, '..', 'incidents'),
  MEMORY_DIR:    path.join(__dirname, '..', 'memory'),
  COOLDOWN_FILE: path.join(__dirname, '..', 'memory', 'cooldowns.json'),
  CHANNEL_FILE:  path.join(__dirname, '..', 'memory', 'incidents_channel.json'),

  // On-call
  ON_CALL_SLACK_USER: optional('ON_CALL_SLACK_USER'),

  // Timezone
  TIMEZONE: optional('TIMEZONE', 'Asia/Kolkata'),

  // Auto-remediation
  AUTO_REMEDIATE_P3: true,

  // Predictive alerts
  PREDICTIVE_LOOKBACK_HOURS: 6,
  PREDICTIVE_WARN_HOURS:     6,

  // Slack bot
  SLACK_INCIDENTS_CHANNEL: 'incidents',

  // Reports
  WEEKLY_REPORT_DAY:  1,
  MONTHLY_REPORT_DAY: 1
};
