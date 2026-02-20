#!/usr/bin/env node

/**
 * Status Page System
 * - Component-based service status tracking
 * - Auto-update status based on incidents
 * - Slack-posted status updates
 * - Status page summary command
 */

const db = require('./db');
const slack = require('./slack');
const config = require('../config');

const STATUS_LEVELS = {
  operational: { emoji: ':large_green_circle:', label: 'Operational', order: 0 },
  degraded_performance: { emoji: ':large_yellow_circle:', label: 'Degraded Performance', order: 1 },
  partial_outage: { emoji: ':large_orange_circle:', label: 'Partial Outage', order: 2 },
  major_outage: { emoji: ':red_circle:', label: 'Major Outage', order: 3 },
  maintenance: { emoji: ':wrench:', label: 'Under Maintenance', order: 4 }
};

/**
 * Register a status page component
 */
async function registerComponent(component) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      INSERT INTO status_page_components (name, description, service_name, display_order, current_status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [
      component.name,
      component.description,
      component.serviceName,
      component.displayOrder || 0,
      component.status || 'operational'
    ]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Update component status
 */
async function updateStatus(componentName, status, message, incidentId = null) {
  const client = await db.getClient();
  try {
    // Update component
    const comp = await client.query(
      'UPDATE status_page_components SET current_status = $1, last_updated = NOW() WHERE name = $2 OR service_name = $2 RETURNING *',
      [status, componentName]
    );

    if (comp.rows.length === 0) {
      await client.end();
      return null;
    }

    // Record the update
    await client.query(`
      INSERT INTO status_page_updates (incident_id, component_id, status, message)
      VALUES ($1, $2, $3, $4)
    `, [incidentId, comp.rows[0].id, status, message]);

    await client.end();

    // Post to Slack
    const statusInfo = STATUS_LEVELS[status] || STATUS_LEVELS.operational;
    const channel = await slack.getIncidentsChannel();
    await slack.postMessage(channel,
      `${statusInfo.emoji} *Status Update: ${comp.rows[0].name}*\n` +
      `Status: ${statusInfo.label}\n` +
      `${message}`
    );

    return comp.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Auto-update status based on incident severity
 */
async function updateFromIncident(incident) {
  const severityToStatus = {
    P1: 'major_outage',
    P2: 'partial_outage',
    P3: 'degraded_performance'
  };

  const status = severityToStatus[incident.severity] || 'degraded_performance';
  const message = `${incident.severity} incident detected: ${incident.metric} at ${incident.metricValue}`;

  return updateStatus(
    incident.resourceId,
    status,
    message,
    incident.incidentId
  );
}

/**
 * Resolve status (back to operational) when incident is resolved
 */
async function resolveStatus(resourceId, incidentId) {
  return updateStatus(resourceId, 'operational', 'Incident resolved. Service restored.', incidentId);
}

/**
 * Get full status page data
 */
async function getStatusPage() {
  const client = await db.getClient();
  try {
    const components = await client.query(`
      SELECT * FROM status_page_components ORDER BY display_order, name
    `);

    // Get recent updates
    const updates = await client.query(`
      SELECT spu.*, spc.name as component_name
      FROM status_page_updates spu
      JOIN status_page_components spc ON spu.component_id = spc.id
      ORDER BY spu.posted_at DESC
      LIMIT 20
    `);

    await client.end();

    // Calculate overall status
    const statuses = components.rows.map(c => STATUS_LEVELS[c.current_status]?.order || 0);
    const worstOrder = Math.max(...statuses, 0);
    const overallStatus = Object.entries(STATUS_LEVELS).find(([, v]) => v.order === worstOrder)?.[0] || 'operational';

    return {
      overallStatus,
      overallLabel: STATUS_LEVELS[overallStatus].label,
      components: components.rows.map(c => ({
        name: c.name,
        description: c.description,
        status: c.current_status,
        statusLabel: STATUS_LEVELS[c.current_status]?.label || 'Unknown',
        emoji: STATUS_LEVELS[c.current_status]?.emoji || ':white_circle:',
        lastUpdated: c.last_updated
      })),
      recentUpdates: updates.rows.slice(0, 10)
    };
  } catch (e) {
    await client.end();
    return { overallStatus: 'operational', components: [], recentUpdates: [] };
  }
}

/**
 * Post status page summary to Slack
 */
async function postStatusSummary(channelId) {
  const page = await getStatusPage();
  const overallInfo = STATUS_LEVELS[page.overallStatus];

  let text = `${overallInfo.emoji} *System Status: ${overallInfo.label}*\n\n`;

  if (page.components.length === 0) {
    text += '_No components registered. Use service catalog to add services._';
  } else {
    for (const comp of page.components) {
      text += `${comp.emoji} *${comp.name}* — ${comp.statusLabel}\n`;
    }
  }

  if (page.recentUpdates.length > 0) {
    text += '\n*Recent Updates:*\n';
    for (const update of page.recentUpdates.slice(0, 5)) {
      const time = new Date(update.posted_at).toLocaleString('en-US', { timeZone: config.TIMEZONE });
      text += `• _${time}_ — ${update.component_name}: ${update.message.substring(0, 100)}\n`;
    }
  }

  const channel = channelId || await slack.getIncidentsChannel();
  return slack.postMessage(channel, text);
}

module.exports = {
  registerComponent,
  updateStatus,
  updateFromIncident,
  resolveStatus,
  getStatusPage,
  postStatusSummary
};
