#!/usr/bin/env node

/**
 * Alert Deduplication & Correlation Engine
 * - Fingerprint-based alert grouping
 * - Flapping detection (auto-suppress noisy alerts)
 * - Topology-aware correlation (group alerts from dependent services)
 * - Alert suppression during maintenance windows
 */

const db = require('./db');
const serviceCatalog = require('./service_catalog');

/**
 * Generate a fingerprint for an anomaly
 */
function generateFingerprint(anomaly) {
  return `${anomaly.serviceType}:${anomaly.resourceId}:${anomaly.metric}`;
}

/**
 * Check if an alert should be suppressed
 * Returns { suppress: boolean, reason: string, groupId: number|null }
 */
async function shouldSuppress(anomaly) {
  const fingerprint = generateFingerprint(anomaly);

  // 1. Check maintenance windows
  const maintenance = await checkMaintenanceWindow(anomaly);
  if (maintenance.active) {
    return { suppress: true, reason: `Maintenance window: ${maintenance.name}`, groupId: null };
  }

  // 2. Check for existing active alert group
  const client = await db.getClient();
  try {
    const existing = await client.query(
      'SELECT * FROM alert_groups WHERE fingerprint = $1 AND status = $2',
      [fingerprint, 'active']
    );

    if (existing.rows.length > 0) {
      const group = existing.rows[0];

      // Update count and last_seen
      await client.query(
        'UPDATE alert_groups SET count = count + 1, last_seen = NOW() WHERE id = $1',
        [group.id]
      );

      // Check for flapping (more than 5 alerts in 10 minutes)
      const timeDiffMs = Date.now() - new Date(group.first_seen).getTime();
      const alertsPerMinute = group.count / (timeDiffMs / 60000);

      if (alertsPerMinute > 0.5 && group.count > 5) {
        // Flapping detected - suppress
        await client.query(
          'UPDATE alert_groups SET suppressed = true WHERE id = $1',
          [group.id]
        );
        await client.end();
        return {
          suppress: true,
          reason: `Flapping detected: ${group.count + 1} alerts in ${Math.round(timeDiffMs / 60000)} minutes`,
          groupId: group.id
        };
      }

      // Already has an incident - deduplicate
      if (group.incident_id) {
        await client.end();
        return {
          suppress: true,
          reason: `Deduplicated: existing incident (group #${group.id}, count: ${group.count + 1})`,
          groupId: group.id
        };
      }

      await client.end();
      return { suppress: false, reason: null, groupId: group.id };
    }

    // 3. Create new alert group
    const newGroup = await client.query(`
      INSERT INTO alert_groups (fingerprint, service_type, resource_id, metric)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [fingerprint, anomaly.serviceType, anomaly.resourceId, anomaly.metric]);

    await client.end();
    return { suppress: false, reason: null, groupId: newGroup.rows[0].id };

  } catch (e) {
    await client.end();
    return { suppress: false, reason: null, groupId: null };
  }
}

/**
 * Link an alert group to an incident
 */
async function linkToIncident(groupId, incidentId) {
  if (!groupId) return;
  const client = await db.getClient();
  try {
    await client.query(
      'UPDATE alert_groups SET incident_id = $1 WHERE id = $2',
      [incidentId, groupId]
    );
    await client.end();
  } catch (e) {
    await client.end();
  }
}

/**
 * Resolve an alert group
 */
async function resolveGroup(groupId) {
  if (!groupId) return;
  const client = await db.getClient();
  try {
    await client.query(
      "UPDATE alert_groups SET status = 'resolved' WHERE id = $1",
      [groupId]
    );
    await client.end();
  } catch (e) {
    await client.end();
  }
}

/**
 * Correlate alerts - find related anomalies from dependent services
 */
async function correlateAlerts(anomaly) {
  const related = [];

  try {
    // Get services that depend on the affected resource
    const dependents = await serviceCatalog.getDependents(anomaly.resourceId);

    // Check if any dependents also have active alert groups
    const client = await db.getClient();
    for (const dep of dependents) {
      const alerts = await client.query(`
        SELECT * FROM alert_groups
        WHERE resource_id = $1 AND status = 'active'
        AND last_seen > NOW() - INTERVAL '15 minutes'
      `, [dep.resource_id || dep.name]);

      if (alerts.rows.length > 0) {
        related.push({
          service: dep.name,
          resourceId: dep.resource_id,
          isCritical: dep.is_critical,
          alertCount: alerts.rows.reduce((sum, a) => sum + a.count, 0)
        });
      }
    }
    await client.end();
  } catch (e) {
    // Correlation is best-effort
  }

  return related;
}

/**
 * Check if resource is in a maintenance window
 */
async function checkMaintenanceWindow(anomaly) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT * FROM maintenance_windows
      WHERE start_time <= NOW() AND end_time >= NOW()
      AND status = 'active'
      AND suppress_alerts = true
      AND ($1 = ANY(service_names) OR $2 = ANY(resource_ids) OR $1 = ANY(resource_ids))
    `, [anomaly.resourceId, anomaly.resourceId]);

    await client.end();

    if (result.rows.length > 0) {
      return { active: true, name: result.rows[0].name, id: result.rows[0].id };
    }
    return { active: false };
  } catch (e) {
    await client.end();
    return { active: false };
  }
}

/**
 * Clean up old resolved alert groups
 */
async function cleanupAlertGroups(olderThanHours = 24) {
  const client = await db.getClient();
  try {
    await client.query(`
      DELETE FROM alert_groups
      WHERE status = 'resolved' AND last_seen < NOW() - INTERVAL '${olderThanHours} hours'
    `);
    // Auto-resolve stale active groups
    await client.query(`
      UPDATE alert_groups SET status = 'resolved'
      WHERE status = 'active' AND last_seen < NOW() - INTERVAL '${olderThanHours} hours'
    `);
    await client.end();
  } catch (e) {
    await client.end();
  }
}

module.exports = {
  generateFingerprint,
  shouldSuppress,
  linkToIncident,
  resolveGroup,
  correlateAlerts,
  checkMaintenanceWindow,
  cleanupAlertGroups
};
