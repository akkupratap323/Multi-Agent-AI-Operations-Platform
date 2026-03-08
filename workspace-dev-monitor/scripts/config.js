#!/usr/bin/env node
/**
 * Dev Monitor — Configuration
 * All values loaded from environment variables (.env file).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
const optional = (key, def = null) => process.env[key] || def;

module.exports = {
  SLACK_BOT_TOKEN:  required('SLACK_BOT_TOKEN'),
  SLACK_CHANNEL:    optional('SLACK_CHANNEL', 'C0AFZ4RNNM6'),
  NEON_API_KEY:     optional('NEON_API_KEY'),
  NEON_DB_URL:      optional('NEON_DB_URL'),
  GITHUB_TOKEN:     optional('GITHUB_TOKEN'),
  NEON_API_BASE:    'https://console.neon.tech/api/v2',
  GITHUB_API:       'https://api.github.com',
  REPOS:            optional('GITHUB_REPOS', 'Terrorizer-AI/opentelemetry-js').split(',').filter(Boolean),
  MONITOR_PROJECTS: optional('NEON_PROJECTS', 'round-mud-51957752').split(',').filter(Boolean),
};
