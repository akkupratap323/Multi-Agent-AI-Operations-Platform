#!/usr/bin/env node

/**
 * MTTX Dashboard & Analytics Engine
 * - MTTA (Mean Time To Acknowledge), MTTR (Mean Time To Resolve), MTTD (Mean Time To Detect)
 * - Incident frequency, severity distribution
 * - Service reliability scores
 * - Weekly/Monthly reports
 * - Trend analysis
 */

const db = require('./db');
const slack = require('./slack');
const config = require('../config');

/**
 * Calculate MTTX metrics for a time period
 */
async function getMTTXMetrics(days = 30) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*) as total_incidents,
        COUNT(*) FILTER (WHERE severity = 'P1') as p1_count,
        COUNT(*) FILTER (WHERE severity = 'P2') as p2_count,
        COUNT(*) FILTER (WHERE severity = 'P3') as p3_count,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'postmortem_complete')) as resolved_count,
        AVG(EXTRACT(EPOCH FROM (diagnosed_at - detected_at))) FILTER (WHERE diagnosed_at IS NOT NULL) as avg_mttd_seconds,
        AVG(EXTRACT(EPOCH FROM (responded_at - detected_at))) FILTER (WHERE responded_at IS NOT NULL) as avg_mtta_seconds,
        AVG(mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL) as avg_mttr_seconds,
        MIN(mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL) as min_mttr_seconds,
        MAX(mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL) as max_mttr_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL) as p50_mttr,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL) as p95_mttr,
        COUNT(*) FILTER (WHERE auto_remediated = true) as auto_remediated_count
      FROM incidents
      WHERE detected_at >= NOW() - INTERVAL '${days} days'
    `);
    await client.end();

    const row = result.rows[0];
    return {
      totalIncidents: parseInt(row.total_incidents),
      p1Count: parseInt(row.p1_count),
      p2Count: parseInt(row.p2_count),
      p3Count: parseInt(row.p3_count),
      resolvedCount: parseInt(row.resolved_count),
      avgMTTD: Math.round(parseFloat(row.avg_mttd_seconds) || 0),
      avgMTTA: Math.round(parseFloat(row.avg_mtta_seconds) || 0),
      avgMTTR: Math.round(parseFloat(row.avg_mttr_seconds) || 0),
      minMTTR: Math.round(parseFloat(row.min_mttr_seconds) || 0),
      maxMTTR: Math.round(parseFloat(row.max_mttr_seconds) || 0),
      p50MTTR: Math.round(parseFloat(row.p50_mttr) || 0),
      p95MTTR: Math.round(parseFloat(row.p95_mttr) || 0),
      autoRemediatedCount: parseInt(row.auto_remediated_count),
      period: `${days} days`
    };
  } catch (e) {
    await client.end();
    return null;
  }
}

/**
 * Get incidents by service for a time period
 */
async function getServiceBreakdown(days = 30) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT
        service_type,
        resource_id,
        COUNT(*) as incident_count,
        COUNT(*) FILTER (WHERE severity = 'P1') as p1_count,
        COUNT(*) FILTER (WHERE severity = 'P2') as p2_count,
        AVG(mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL) as avg_mttr,
        MAX(detected_at) as last_incident
      FROM incidents
      WHERE detected_at >= NOW() - INTERVAL '${days} days'
      GROUP BY service_type, resource_id
      ORDER BY incident_count DESC
    `);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Get daily incident trend
 */
async function getDailyTrend(days = 30) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT
        DATE(detected_at AT TIME ZONE '${config.TIMEZONE}') as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'P1') as p1,
        COUNT(*) FILTER (WHERE severity = 'P2') as p2,
        COUNT(*) FILTER (WHERE severity = 'P3') as p3,
        AVG(mttr_seconds) FILTER (WHERE mttr_seconds IS NOT NULL) as avg_mttr
      FROM incidents
      WHERE detected_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(detected_at AT TIME ZONE '${config.TIMEZONE}')
      ORDER BY date
    `);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Get top recurring issues
 */
async function getTopRecurringIssues(days = 30, limit = 10) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT
        service_type, resource_id, metric,
        COUNT(*) as occurrence_count,
        AVG(metric_value::float) as avg_metric_value,
        MAX(severity) as worst_severity,
        MAX(detected_at) as last_occurrence
      FROM incidents
      WHERE detected_at >= NOW() - INTERVAL '${days} days'
      GROUP BY service_type, resource_id, metric
      HAVING COUNT(*) > 1
      ORDER BY occurrence_count DESC
      LIMIT $1
    `, [limit]);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Format and post a weekly report to Slack
 */
async function postWeeklyReport() {
  const metrics = await getMTTXMetrics(7);
  const serviceBreakdown = await getServiceBreakdown(7);
  const recurring = await getTopRecurringIssues(7, 5);

  if (!metrics) return;

  const formatTime = (seconds) => {
    if (!seconds || seconds === 0) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  let report = `:bar_chart: *Weekly Incident Report* (Last 7 days)\n\n`;

  // Overview
  report += `*Overview*\n`;
  report += `Total Incidents: *${metrics.totalIncidents}*`;
  if (metrics.totalIncidents > 0) {
    report += ` (P1: ${metrics.p1Count} | P2: ${metrics.p2Count} | P3: ${metrics.p3Count})`;
  }
  report += `\nResolved: ${metrics.resolvedCount}/${metrics.totalIncidents}`;
  if (metrics.autoRemediatedCount > 0) {
    report += ` (${metrics.autoRemediatedCount} auto-remediated)`;
  }
  report += '\n\n';

  // MTTX
  report += `*Response Metrics*\n`;
  report += `MTTD (Detect): ${formatTime(metrics.avgMTTD)}\n`;
  report += `MTTA (Acknowledge): ${formatTime(metrics.avgMTTA)}\n`;
  report += `MTTR (Resolve): ${formatTime(metrics.avgMTTR)} (P50: ${formatTime(metrics.p50MTTR)} | P95: ${formatTime(metrics.p95MTTR)})\n\n`;

  // Service breakdown
  if (serviceBreakdown.length > 0) {
    report += `*By Service*\n`;
    for (const svc of serviceBreakdown.slice(0, 5)) {
      report += `• ${svc.service_type}/${svc.resource_id}: ${svc.incident_count} incidents (MTTR: ${formatTime(Math.round(parseFloat(svc.avg_mttr) || 0))})\n`;
    }
    report += '\n';
  }

  // Recurring issues
  if (recurring.length > 0) {
    report += `*Recurring Issues* :warning:\n`;
    for (const issue of recurring) {
      report += `• ${issue.service_type}/${issue.resource_id} — ${issue.metric}: ${issue.occurrence_count}x (worst: ${issue.worst_severity})\n`;
    }
  }

  const channel = await slack.getIncidentsChannel();
  return slack.postMessage(channel, report);
}

/**
 * Format and post a monthly report
 */
async function postMonthlyReport() {
  const metrics = await getMTTXMetrics(30);
  const prevMetrics = await getMTTXMetrics(60); // Previous period for comparison
  const serviceBreakdown = await getServiceBreakdown(30);
  const trend = await getDailyTrend(30);

  if (!metrics) return;

  const formatTime = (seconds) => {
    if (!seconds || seconds === 0) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const trendArrow = (current, previous) => {
    if (!previous || previous === 0) return '';
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 5) return ' (stable)';
    return change > 0 ? ` (:arrow_up: ${Math.round(change)}%)` : ` (:arrow_down: ${Math.abs(Math.round(change))}%)`;
  };

  let report = `:calendar: *Monthly Incident Report* (Last 30 days)\n\n`;

  report += `*Summary*\n`;
  report += `Total: *${metrics.totalIncidents}* incidents${trendArrow(metrics.totalIncidents, prevMetrics?.totalIncidents)}\n`;
  report += `P1: ${metrics.p1Count} | P2: ${metrics.p2Count} | P3: ${metrics.p3Count}\n`;
  report += `Resolution rate: ${metrics.totalIncidents > 0 ? Math.round(metrics.resolvedCount / metrics.totalIncidents * 100) : 0}%\n\n`;

  report += `*Performance*\n`;
  report += `MTTD: ${formatTime(metrics.avgMTTD)}${trendArrow(metrics.avgMTTD, prevMetrics?.avgMTTD)}\n`;
  report += `MTTA: ${formatTime(metrics.avgMTTA)}${trendArrow(metrics.avgMTTA, prevMetrics?.avgMTTA)}\n`;
  report += `MTTR: ${formatTime(metrics.avgMTTR)}${trendArrow(metrics.avgMTTR, prevMetrics?.avgMTTR)}\n`;
  report += `P95 MTTR: ${formatTime(metrics.p95MTTR)}\n`;

  const channel = await slack.getIncidentsChannel();
  return slack.postMessage(channel, report);
}

module.exports = {
  getMTTXMetrics,
  getServiceBreakdown,
  getDailyTrend,
  getTopRecurringIssues,
  postWeeklyReport,
  postMonthlyReport
};
