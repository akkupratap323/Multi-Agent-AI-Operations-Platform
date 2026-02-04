#!/usr/bin/env node

/**
 * Stage 1: Monitor (V2)
 * Enhanced with: dedup, maintenance windows, predictive alerts,
 * SLO checks, escalation checks, multi-cloud ready
 */

const fs = require('fs');
const config = require('./config');
const cw = require('./utils/cloudwatch');
const dedup = require('./utils/dedup');
const maintenance = require('./utils/maintenance');
const predictive = require('./utils/predictive');
const slo = require('./utils/slo');
const oncall = require('./utils/oncall');
// ============================================================
// Cooldown Management
// ============================================================

function loadCooldowns() {
  try {
    if (fs.existsSync(config.COOLDOWN_FILE)) {
      return JSON.parse(fs.readFileSync(config.COOLDOWN_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveCooldowns(cooldowns) {
  fs.writeFileSync(config.COOLDOWN_FILE, JSON.stringify(cooldowns, null, 2));
}

function isInCooldown(service, resource, metric) {
  const cooldowns = loadCooldowns();
  const key = `${service}:${resource}:${metric}`;
  const lastAlert = cooldowns[key];
  if (!lastAlert) return false;
  return (Date.now() - lastAlert) / (60 * 1000) < config.ALERT_COOLDOWN_MINUTES;
}

function setCooldown(service, resource, metric) {
  const cooldowns = loadCooldowns();
  const key = `${service}:${resource}:${metric}`;
  cooldowns[key] = Date.now();

  const cutoff = Date.now() - (config.ALERT_COOLDOWN_MINUTES * 60 * 1000);
  for (const k of Object.keys(cooldowns)) {
    if (cooldowns[k] < cutoff) delete cooldowns[k];
  }
  saveCooldowns(cooldowns);
}

// ============================================================
// Threshold Checking
// ============================================================

function checkThreshold(serviceType, metricName, value) {
  const thresholds = config.THRESHOLDS[serviceType];
  if (!thresholds || !thresholds[metricName]) return null;

  const t = thresholds[metricName];
  const inverted = config.INVERTED_METRICS.includes(metricName);

  if (inverted) {
    if (t.p1 !== undefined && value <= t.p1) return 'P1';
    if (t.p2 !== undefined && value <= t.p2) return 'P2';
    if (t.p3 !== undefined && value <= t.p3) return 'P3';
  } else {
    if (t.p1 !== undefined && value >= t.p1) return 'P1';
    if (t.p2 !== undefined && value >= t.p2) return 'P2';
    if (t.p3 !== undefined && value >= t.p3) return 'P3';
  }

  return null;
}

// ============================================================
// Lightsail Instance Monitoring
// ============================================================

function checkLightsailInstances() {
  const anomalies = [];
  const instances = cw.listLightsailInstances();

  console.log(`  Lightsail instances found: ${instances.length}`);

  for (const inst of instances) {
    console.log(`  Checking: ${inst.name} (${inst.blueprint}, ${inst.cpuCount} vCPU, ${inst.ramGb}GB RAM)`);
    const metrics = cw.getLightsailInstanceMetrics(inst.name);

    console.log(`    CPU: ${metrics.CPUUtilization?.toFixed(2)}% | Burst: ${metrics.BurstCapacityPercentage?.toFixed(1)}% | StatusCheck: ${metrics.StatusCheckFailed}`);

    const metricsToCheck = ['CPUUtilization', 'StatusCheckFailed', 'StatusCheckFailed_Instance', 'StatusCheckFailed_System', 'BurstCapacityPercentage'];

    for (const metric of metricsToCheck) {
      const value = metrics[metric];
      if (value === null || value === undefined) continue;

      const severity = checkThreshold('lightsail', metric, value);
      if (severity && !isInCooldown('lightsail', inst.name, metric)) {
        anomalies.push({
          serviceType: 'lightsail',
          resourceId: inst.name,
          resourceName: inst.name,
          metric,
          metricValue: Math.round(value * 100) / 100,
          thresholdValue: config.THRESHOLDS.lightsail[metric][severity.toLowerCase()],
          severity,
          rawMetrics: metrics,
          extra: {
            ip: inst.ip,
            blueprint: inst.blueprint,
            bundle: inst.bundle,
            cpuCount: inst.cpuCount,
            ramGb: inst.ramGb
          }
        });
      }
    }
  }

  return anomalies;
}

// ============================================================
// Lightsail Database Monitoring
// ============================================================

function checkLightsailDatabases() {
  const anomalies = [];
  const databases = cw.listLightsailDatabases();

  if (databases.length > 0) {
    console.log(`  Lightsail databases found: ${databases.length}`);
  }

  for (const db of databases) {
    const metrics = cw.getLightsailDBMetrics(db.name);

    for (const metric of ['CPUUtilization', 'DatabaseConnections']) {
      const value = metrics[metric];
      if (value === null || value === undefined) continue;

      const severity = checkThreshold('lightsail_db', metric, value);
      if (severity && !isInCooldown('lightsail_db', db.name, metric)) {
        anomalies.push({
          serviceType: 'lightsail_db',
          resourceId: db.name,
          resourceName: db.name,
          metric,
          metricValue: Math.round(value * 100) / 100,
          thresholdValue: config.THRESHOLDS.lightsail_db[metric][severity.toLowerCase()],
          severity,
          rawMetrics: metrics,
          extra: { engine: db.engine }
        });
      }
    }
  }

  return anomalies;
}

// ============================================================
// Standard EC2 Monitoring
// ============================================================

function checkEC2() {
  const anomalies = [];
  const instances = cw.listEC2Instances();

  if (instances.length > 0) {
    console.log(`  EC2 instances found: ${instances.length}`);
  }

  for (const inst of instances) {
    const metrics = cw.getEC2Metrics(inst.id);

    for (const [metric, value] of Object.entries(metrics)) {
      if (value === null || value === undefined) continue;
      const severity = checkThreshold('ec2', metric, value);
      if (severity && !isInCooldown('ec2', inst.id, metric)) {
        anomalies.push({
          serviceType: 'ec2',
          resourceId: inst.id,
          resourceName: inst.name,
          metric,
          metricValue: Math.round(value * 100) / 100,
          thresholdValue: config.THRESHOLDS.ec2[metric][severity.toLowerCase()],
          severity,
          rawMetrics: metrics
        });
      }
    }
  }

  return anomalies;
}

// ============================================================
// Main Monitor (V2 Enhanced)
// ============================================================

async function monitor() {
  console.log(`🔍 [MONITOR V2] Scanning AWS resources in ${config.AWS_REGION}...`);
  const allAnomalies = [];

  // 1. Check maintenance windows
  try {
    await maintenance.checkMaintenanceWindows();
  } catch (e) {
    console.error('  Maintenance check error:', e.message);
  }

  // 2. Run infrastructure checks
  const checks = [
    { name: 'Lightsail Instances', fn: checkLightsailInstances },
    { name: 'Lightsail Databases', fn: checkLightsailDatabases },
    { name: 'EC2 Instances', fn: checkEC2 }
  ];

  for (const check of checks) {
    try {
      const anomalies = check.fn();
      allAnomalies.push(...anomalies);
    } catch (error) {
      console.error(`  ${check.name} check failed:`, error.message);
    }
  }

  // 3. Check SLO alerts
  try {
    const sloAlerts = await slo.checkSLOAlerts();
    for (const alert of sloAlerts) {
      console.log(`  SLO Alert: ${alert.message}`);
      // SLO alerts are informational, posted to Slack
      const slack = require('./utils/slack');
      const channel = await slack.getIncidentsChannel();
      await slack.postMessage(channel,
        `:chart_with_downwards_trend: *SLO Alert: ${alert.slo.name}*\n${alert.message}`
      );
    }
  } catch (e) {
    // SLO check is best-effort
  }

  // 4. Run predictive analysis
  try {
    const warnings = await predictive.runPredictiveAnalysis();
    if (warnings.length > 0) {
      console.log(`  📈 ${warnings.length} predictive warning(s)`);
      await predictive.postWarnings(warnings);
    }
  } catch (e) {
    console.error('  Predictive analysis error:', e.message);
  }

  // 5. Check escalations for unacknowledged incidents
  try {
    const escalated = await oncall.checkEscalations();
    if (escalated > 0) {
      console.log(`  ⬆️ Escalated ${escalated} incident(s)`);
    }
  } catch (e) {
    // Escalation check is best-effort
  }

  // 6. Clean up old alert groups
  try {
    await dedup.cleanupAlertGroups();
  } catch (e) {
    // Cleanup is best-effort
  }

  // 7. Process anomalies
  if (allAnomalies.length === 0) {
    console.log('  ✅ All resources healthy');
    return;
  }

  console.log(`\n🚨 Detected ${allAnomalies.length} anomalie(s):`);

  for (const anomaly of allAnomalies) {
    console.log(`  ${anomaly.severity} | ${anomaly.serviceType}/${anomaly.resourceId} | ${anomaly.metric}=${anomaly.metricValue}`);

    // Check deduplication & suppression
    const suppressResult = await dedup.shouldSuppress(anomaly);
    if (suppressResult.suppress) {
      console.log(`    Suppressed: ${suppressResult.reason}`);
      continue;
    }

    // Set cooldown
    setCooldown(anomaly.serviceType, anomaly.resourceId, anomaly.metric);

    // Attach alert group ID
    anomaly.alertGroupId = suppressResult.groupId;

    try {
      const { runPipeline } = require('./incident_pipeline');
      await runPipeline(anomaly);
    } catch (error) {
      console.error(`Pipeline failed for ${anomaly.resourceId}:`, error.message);
    }
  }
}

// ============================================================
// Continuous Loop (runs every 60s, keeps process alive)
// ============================================================

const POLL_INTERVAL_MS = 60 * 1000;
let isRunning = false;

async function loop() {
  if (isRunning) return; // Prevent overlapping runs
  isRunning = true;
  try {
    await monitor();
  } catch (err) {
    console.error('Monitor error:', err.message);
  } finally {
    isRunning = false;
  }
}

console.log(`🚀 Incident Commander Monitor started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
loop(); // Run immediately on start
setInterval(loop, POLL_INTERVAL_MS);
