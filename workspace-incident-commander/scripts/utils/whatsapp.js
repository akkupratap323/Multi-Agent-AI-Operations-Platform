#!/usr/bin/env node

/**
 * WhatsApp delivery utility
 * Sends critical incident alerts via WhatsApp
 */

const { execSync } = require('child_process');
const config = require('../config');

/**
 * Send a WhatsApp alert message
 */
function sendAlert(message) {
  try {
    // Try openclaw's built-in WhatsApp channel
    execSync(
      `openclaw channels send --channel whatsapp --to "${config.WHATSAPP_TO}" --text "${message.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', stdio: 'pipe', timeout: 15000 }
    );
    console.log('WhatsApp alert sent');
    return true;
  } catch (error) {
    console.error('WhatsApp send failed:', error.message);

    // Fallback: try wacli if available
    try {
      execSync(
        `wacli send "${config.WHATSAPP_TO}" "${message.replace(/"/g, '\\"')}"`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 15000 }
      );
      console.log('WhatsApp alert sent (via wacli fallback)');
      return true;
    } catch (fallbackError) {
      console.error('WhatsApp fallback also failed:', fallbackError.message);
      return false;
    }
  }
}

/**
 * Format an incident for WhatsApp (plain text, no markdown)
 */
function formatIncidentAlert(incident) {
  const severity = incident.severity;
  const emoji = severity === 'P1' ? '🔴' : severity === 'P2' ? '🟠' : '🟡';

  return [
    `${emoji} ${severity} INCIDENT - ${incident.incidentNumber}`,
    '',
    `Service: ${incident.serviceType} / ${incident.resourceId}`,
    `Metric: ${incident.metric} = ${incident.metricValue} (threshold: ${incident.thresholdValue})`,
    `Root Cause: ${incident.rootCause || 'Analyzing...'}`,
    '',
    `Check Slack war room for details and approval.`
  ].join('\n');
}

module.exports = { sendAlert, formatIncidentAlert };
