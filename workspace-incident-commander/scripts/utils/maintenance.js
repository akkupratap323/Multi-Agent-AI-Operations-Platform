#!/usr/bin/env node

/**
 * Scheduled Maintenance Windows
 * - Create/manage planned downtime windows
 * - Auto-suppress alerts during maintenance
 * - Recurring maintenance support
 * - Slack notifications before/after maintenance
 */

const db = require('./db');
const slack = require('./slack');
const config = require('../config');

/**
 * Create a maintenance window
 */
async function createWindow(window) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      INSERT INTO maintenance_windows (
        name, description, service_names, resource_ids,
        start_time, end_time, recurring, recurrence_rule,
        suppress_alerts, created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      window.name,
      window.description,
      window.serviceNames || [],
      window.resourceIds || [],
      window.startTime,
      window.endTime,
      window.recurring || false,
      window.recurrenceRule || null,
      window.suppressAlerts !== false,
      window.createdBy || 'system',
      'scheduled'
    ]);
    await client.end();

    // Notify Slack about scheduled maintenance
    const channel = await slack.getIncidentsChannel();
    const start = new Date(window.startTime).toLocaleString('en-US', { timeZone: config.TIMEZONE });
    const end = new Date(window.endTime).toLocaleString('en-US', { timeZone: config.TIMEZONE });
    await slack.postMessage(channel,
      `:wrench: *Maintenance Scheduled*\n` +
      `*${window.name}*\n` +
      `${window.description || ''}\n` +
      `Services: ${(window.serviceNames || []).join(', ') || 'All'}\n` +
      `Start: ${start}\n` +
      `End: ${end}\n` +
      `Alerts suppressed: ${window.suppressAlerts !== false ? 'Yes' : 'No'}`
    );

    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Get active maintenance windows
 */
async function getActiveWindows() {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT * FROM maintenance_windows
      WHERE start_time <= NOW() AND end_time >= NOW()
      AND status IN ('scheduled', 'active')
      ORDER BY start_time
    `);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Check if a resource is currently in maintenance
 */
async function isInMaintenance(resourceId, serviceName) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT * FROM maintenance_windows
      WHERE start_time <= NOW() AND end_time >= NOW()
      AND status IN ('scheduled', 'active')
      AND suppress_alerts = true
      AND ($1 = ANY(resource_ids) OR $2 = ANY(service_names) OR $1 = ANY(service_names))
    `, [resourceId, serviceName || resourceId]);

    await client.end();
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (e) {
    await client.end();
    return null;
  }
}

/**
 * Start a maintenance window (activate it)
 */
async function activateWindow(windowId) {
  const client = await db.getClient();
  try {
    await client.query(
      "UPDATE maintenance_windows SET status = 'active' WHERE id = $1",
      [windowId]
    );
    await client.end();

    const channel = await slack.getIncidentsChannel();
    await slack.postMessage(channel,
      `:construction: *Maintenance Started* (Window #${windowId})\nAlerts will be suppressed for affected services.`
    );
  } catch (e) {
    await client.end();
  }
}

/**
 * Complete a maintenance window
 */
async function completeWindow(windowId) {
  const client = await db.getClient();
  try {
    await client.query(
      "UPDATE maintenance_windows SET status = 'completed' WHERE id = $1",
      [windowId]
    );
    await client.end();

    const channel = await slack.getIncidentsChannel();
    await slack.postMessage(channel,
      `:white_check_mark: *Maintenance Complete* (Window #${windowId})\nNormal alerting resumed.`
    );
  } catch (e) {
    await client.end();
  }
}

/**
 * Check and activate/complete maintenance windows based on time
 */
async function checkMaintenanceWindows() {
  const client = await db.getClient();
  try {
    // Activate scheduled windows that have started
    const toActivate = await client.query(`
      SELECT * FROM maintenance_windows
      WHERE status = 'scheduled' AND start_time <= NOW() AND end_time >= NOW()
    `);
    for (const w of toActivate.rows) {
      await activateWindow(w.id);
    }

    // Complete active windows that have ended
    const toComplete = await client.query(`
      SELECT * FROM maintenance_windows
      WHERE status = 'active' AND end_time < NOW()
    `);
    for (const w of toComplete.rows) {
      await completeWindow(w.id);
    }

    await client.end();
  } catch (e) {
    await client.end();
  }
}

/**
 * List upcoming maintenance windows
 */
async function listUpcoming(days = 7) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT * FROM maintenance_windows
      WHERE end_time >= NOW() AND start_time <= NOW() + INTERVAL '${days} days'
      ORDER BY start_time
    `);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

module.exports = {
  createWindow,
  getActiveWindows,
  isInMaintenance,
  activateWindow,
  completeWindow,
  checkMaintenanceWindows,
  listUpcoming
};
