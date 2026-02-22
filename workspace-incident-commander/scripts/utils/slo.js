#!/usr/bin/env node

/**
 * SLO Tracking & Error Budget Engine
 * - Define SLOs per service (availability, latency, error rate)
 * - Track error budget consumption
 * - Burn rate alerts (fast/slow burn)
 * - Dashboard data for SLO reporting
 */

const db = require('./db');
const config = require('../config');

/**
 * Create an SLO definition
 */
async function createSLO(slo) {
  const client = await db.getClient();
  try {
    // Calculate error budget: 1 - target (e.g., 99.9% target = 0.1% error budget)
    const errorBudget = 1 - (slo.targetValue / 100);

    const result = await client.query(`
      INSERT INTO slo_definitions (name, service_name, metric_type, target_value, window_type, window_days, error_budget, alert_burn_rate, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      slo.name,
      slo.serviceName,
      slo.metricType, // 'availability', 'latency', 'error_rate', 'uptime'
      slo.targetValue,
      slo.windowType || 'rolling',
      slo.windowDays || 30,
      errorBudget,
      slo.alertBurnRate || 1.0,
      slo.description
    ]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Record an SLO measurement
 */
async function recordMeasurement(sloId, totalEvents, goodEvents, metadata = {}) {
  const client = await db.getClient();
  try {
    const slo = await client.query('SELECT * FROM slo_definitions WHERE id = $1', [sloId]);
    if (slo.rows.length === 0) { await client.end(); return null; }

    const sloObj = slo.rows[0];
    const currentValue = totalEvents > 0 ? (goodEvents / totalEvents) * 100 : 100;

    // Calculate error budget remaining
    const targetDecimal = sloObj.target_value / 100;
    const actualDecimal = currentValue / 100;
    const errorBudgetTotal = 1 - targetDecimal;
    const errorBudgetUsed = Math.max(0, targetDecimal - actualDecimal);
    const errorBudgetRemaining = errorBudgetTotal > 0
      ? Math.max(0, (errorBudgetTotal - errorBudgetUsed) / errorBudgetTotal)
      : 1;

    // Calculate burn rate (how fast error budget is being consumed)
    // Burn rate 1.0 = consuming budget at expected rate
    // Burn rate > 1.0 = consuming faster than expected
    const windowMs = sloObj.window_days * 24 * 60 * 60 * 1000;
    const expectedBurnPerMs = errorBudgetTotal / windowMs;
    const actualBurnPerMs = errorBudgetUsed / (Date.now() - new Date(sloObj.created_at).getTime());
    const burnRate = expectedBurnPerMs > 0 ? actualBurnPerMs / expectedBurnPerMs : 0;

    const result = await client.query(`
      INSERT INTO slo_measurements (slo_id, total_events, good_events, current_value, error_budget_remaining, burn_rate, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [sloId, totalEvents, goodEvents, currentValue, errorBudgetRemaining, burnRate, JSON.stringify(metadata)]);

    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Get current SLO status for a service
 */
async function getSLOStatus(serviceName) {
  const client = await db.getClient();
  try {
    const slos = await client.query(
      'SELECT * FROM slo_definitions WHERE service_name = $1',
      [serviceName]
    );

    const results = [];
    for (const slo of slos.rows) {
      // Get latest measurement
      const latest = await client.query(`
        SELECT * FROM slo_measurements
        WHERE slo_id = $1
        ORDER BY measured_at DESC LIMIT 1
      `, [slo.id]);

      // Get measurements over window period
      const windowMeasurements = await client.query(`
        SELECT
          SUM(total_events) as total,
          SUM(good_events) as good,
          AVG(burn_rate) as avg_burn_rate
        FROM slo_measurements
        WHERE slo_id = $1 AND measured_at >= NOW() - INTERVAL '${slo.window_days} days'
      `, [slo.id]);

      const window = windowMeasurements.rows[0];
      const windowValue = window.total > 0 ? (window.good / window.total) * 100 : null;

      results.push({
        slo,
        latest: latest.rows[0] || null,
        windowValue,
        avgBurnRate: parseFloat(window.avg_burn_rate) || 0,
        isBreaching: windowValue !== null && windowValue < slo.target_value,
        errorBudgetRemaining: latest.rows[0]?.error_budget_remaining || 1
      });
    }

    await client.end();
    return results;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Check all SLOs for burn rate alerts
 */
async function checkSLOAlerts() {
  const client = await db.getClient();
  try {
    const slos = await client.query('SELECT * FROM slo_definitions');
    const alerts = [];

    for (const slo of slos.rows) {
      const latest = await client.query(`
        SELECT * FROM slo_measurements
        WHERE slo_id = $1
        ORDER BY measured_at DESC LIMIT 1
      `, [slo.id]);

      if (latest.rows.length === 0) continue;

      const measurement = latest.rows[0];
      const burnRate = parseFloat(measurement.burn_rate);
      const budgetRemaining = parseFloat(measurement.error_budget_remaining);

      // Fast burn: burn rate > 14x (will exhaust budget in ~2 hours)
      if (burnRate > 14) {
        alerts.push({
          slo,
          type: 'fast_burn',
          severity: 'P1',
          burnRate,
          budgetRemaining,
          message: `FAST BURN: ${slo.name} burning error budget at ${burnRate.toFixed(1)}x rate. Budget remaining: ${(budgetRemaining * 100).toFixed(1)}%`
        });
      }
      // Slow burn: burn rate > 1x (will exhaust budget before window ends)
      else if (burnRate > 1 && budgetRemaining < 0.5) {
        alerts.push({
          slo,
          type: 'slow_burn',
          severity: 'P2',
          burnRate,
          budgetRemaining,
          message: `SLOW BURN: ${slo.name} at ${burnRate.toFixed(1)}x burn rate. Budget remaining: ${(budgetRemaining * 100).toFixed(1)}%`
        });
      }
      // Budget exhausted
      else if (budgetRemaining <= 0) {
        alerts.push({
          slo,
          type: 'budget_exhausted',
          severity: 'P1',
          burnRate,
          budgetRemaining: 0,
          message: `BUDGET EXHAUSTED: ${slo.name} has consumed 100% of error budget!`
        });
      }
    }

    await client.end();
    return alerts;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Get all SLOs
 */
async function listSLOs() {
  const client = await db.getClient();
  try {
    const result = await client.query('SELECT * FROM slo_definitions ORDER BY service_name, name');
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

module.exports = {
  createSLO,
  recordMeasurement,
  getSLOStatus,
  checkSLOAlerts,
  listSLOs
};
