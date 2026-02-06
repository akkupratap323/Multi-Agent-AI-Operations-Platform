#!/usr/bin/env node

/**
 * Database utilities for incident storage
 * Uses existing pg package from /Users/apple/.openclaw/node_modules
 */

const { Client } = require('/Users/apple/.openclaw/node_modules/pg');
const config = require('../config');

async function getClient() {
  const client = new Client({
    connectionString: config.NEON_DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  return client;
}

async function createIncident(incident) {
  const client = await getClient();
  try {
    const result = await client.query(`
      INSERT INTO incidents (
        incident_number, severity, status, service_type, resource_id,
        metric, metric_value, threshold_value, raw_metrics, detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, incident_number
    `, [
      incident.incidentNumber,
      incident.severity,
      'detected',
      incident.serviceType,
      incident.resourceId,
      incident.metric,
      incident.metricValue,
      incident.thresholdValue,
      JSON.stringify(incident.rawMetrics || {})
    ]);
    await client.end();
    return result.rows[0];
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function updateIncident(id, fields) {
  const client = await getClient();
  try {
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      setClauses.push(`"${dbKey}" = $${idx}`);
      values.push(key === 'suggestedFixes' || key === 'rawMetrics' ? JSON.stringify(value) : value);
      idx++;
    }

    setClauses.push(`"updated_at" = NOW()`);
    values.push(id);

    await client.query(
      `UPDATE incidents SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );
    await client.end();
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function getIncident(id) {
  const client = await getClient();
  try {
    const result = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    await client.end();
    return result.rows[0] || null;
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function getActiveIncidents() {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT * FROM incidents WHERE status NOT IN ('resolved', 'postmortem_complete') ORDER BY detected_at DESC`
    );
    await client.end();
    return result.rows;
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function getNextIncidentNumber() {
  const client = await getClient();
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await client.query(
      `SELECT COUNT(*) as count FROM incidents WHERE incident_number LIKE $1`,
      [`INC-${today}-%`]
    );
    await client.end();
    const count = parseInt(result.rows[0].count) + 1;
    return `INC-${today}-${String(count).padStart(3, '0')}`;
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function recordTimeline(incidentId, eventType, description, metadata = {}) {
  const client = await getClient();
  try {
    await client.query(`
      INSERT INTO incident_timeline (incident_id, event_type, description, metadata)
      VALUES ($1, $2, $3, $4)
    `, [incidentId, eventType, description, JSON.stringify(metadata)]);
    await client.end();
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function getTimeline(incidentId) {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY created_at ASC`,
      [incidentId]
    );
    await client.end();
    return result.rows;
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function getIncidentHistory(days = 30) {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT * FROM incidents WHERE detected_at >= NOW() - INTERVAL '${days} days' ORDER BY detected_at DESC`
    );
    await client.end();
    return result.rows;
  } catch (error) {
    await client.end();
    throw error;
  }
}

module.exports = {
  getClient,
  createIncident,
  updateIncident,
  getIncident,
  getActiveIncidents,
  getNextIncidentNumber,
  recordTimeline,
  getTimeline,
  getIncidentHistory
};
