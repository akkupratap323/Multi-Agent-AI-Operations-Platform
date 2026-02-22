#!/usr/bin/env node

/**
 * Predictive Alerts Engine
 * - Trend-based warnings before thresholds breach
 * - Linear regression on metric history to predict future values
 * - Early warning Slack notifications
 * - Capacity forecasting
 */

const config = require('../config');
const cw = require('./cloudwatch');
const slack = require('./slack');
const db = require('./db');

/**
 * Collect metric history (last N hours) for trend analysis
 */
function collectMetricHistory(instanceName, metricName, hours = 6) {
  const datapoints = [];
  const now = Date.now();

  // Collect hourly datapoints
  for (let h = hours; h >= 0; h--) {
    const end = new Date(now - h * 3600000);
    const start = new Date(end - 3600000);

    try {
      const data = cw.runAWS(
        `lightsail get-instance-metric-data ` +
        `--instance-name "${instanceName}" ` +
        `--metric-name ${metricName} ` +
        `--period 3600 ` +
        `--start-time "${start.toISOString()}" ` +
        `--end-time "${end.toISOString()}" ` +
        `--unit ${metricName === 'BurstCapacityPercentage' ? 'Percent' : metricName === 'CPUUtilization' ? 'Percent' : 'Count'} ` +
        `--statistics Average`
      );

      if (data && data.metricData && data.metricData.length > 0) {
        datapoints.push({
          timestamp: end.getTime(),
          value: data.metricData[0].average
        });
      }
    } catch (e) {
      // Skip failed datapoints
    }
  }

  return datapoints;
}

/**
 * Simple linear regression
 * Returns { slope, intercept, r2 }
 */
function linearRegression(datapoints) {
  if (datapoints.length < 3) return null;

  const n = datapoints.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  // Normalize timestamps to hours
  const baseTime = datapoints[0].timestamp;
  const points = datapoints.map(p => ({
    x: (p.timestamp - baseTime) / 3600000,
    y: p.value
  }));

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared (correlation coefficient)
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  const r = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const r2 = r * r;

  return { slope, intercept, r2, baseTime };
}

/**
 * Predict when a metric will hit a threshold
 * Returns hours until threshold breach, or null if not trending toward breach
 */
function predictBreach(regression, currentValue, threshold, inverted = false) {
  if (!regression || regression.r2 < 0.3) return null; // Low confidence

  if (inverted) {
    // For inverted metrics (lower = worse), check if trending down toward threshold
    if (regression.slope >= 0) return null; // Trending up, no breach
    if (currentValue <= threshold) return 0; // Already breached

    const hoursToThreshold = (threshold - currentValue) / regression.slope;
    return hoursToThreshold > 0 ? hoursToThreshold : null;
  } else {
    // Normal metrics (higher = worse)
    if (regression.slope <= 0) return null; // Trending down, no breach
    if (currentValue >= threshold) return 0; // Already breached

    const currentHours = (Date.now() - regression.baseTime) / 3600000;
    const predictedCurrent = regression.slope * currentHours + regression.intercept;
    const hoursToThreshold = (threshold - predictedCurrent) / regression.slope;
    return hoursToThreshold > 0 ? hoursToThreshold : null;
  }
}

/**
 * Run predictive analysis on all monitored resources
 */
async function runPredictiveAnalysis() {
  console.log('  Running predictive analysis...');
  const warnings = [];

  try {
    const instances = cw.listLightsailInstances();

    for (const inst of instances) {
      // Check CPU trend
      const cpuHistory = collectMetricHistory(inst.name, 'CPUUtilization', 6);
      if (cpuHistory.length >= 3) {
        const regression = linearRegression(cpuHistory);
        const currentCPU = cpuHistory[cpuHistory.length - 1]?.value || 0;
        const p3Threshold = config.THRESHOLDS.lightsail?.CPUUtilization?.p3 || 75;

        const hoursToBreach = predictBreach(regression, currentCPU, p3Threshold);

        if (hoursToBreach !== null && hoursToBreach > 0 && hoursToBreach <= 6) {
          warnings.push({
            type: 'trend_warning',
            severity: hoursToBreach <= 1 ? 'P2' : 'P3',
            resource: inst.name,
            metric: 'CPUUtilization',
            currentValue: Math.round(currentCPU * 100) / 100,
            threshold: p3Threshold,
            hoursToBreech: Math.round(hoursToBreach * 10) / 10,
            confidence: Math.round(regression.r2 * 100),
            slope: Math.round(regression.slope * 100) / 100,
            message: `CPU trending up at ${Math.round(regression.slope * 100) / 100}%/hr. Expected to hit ${p3Threshold}% in ~${Math.round(hoursToBreach * 10) / 10} hours.`
          });
        }
      }

      // Check Burst Capacity trend (inverted)
      const burstHistory = collectMetricHistory(inst.name, 'BurstCapacityPercentage', 6);
      if (burstHistory.length >= 3) {
        const regression = linearRegression(burstHistory);
        const currentBurst = burstHistory[burstHistory.length - 1]?.value || 100;
        const p3Threshold = config.THRESHOLDS.lightsail?.BurstCapacityPercentage?.p3 || 30;

        const hoursToBreach = predictBreach(regression, currentBurst, p3Threshold, true);

        if (hoursToBreach !== null && hoursToBreach > 0 && hoursToBreach <= 6) {
          warnings.push({
            type: 'trend_warning',
            severity: hoursToBreach <= 1 ? 'P2' : 'P3',
            resource: inst.name,
            metric: 'BurstCapacityPercentage',
            currentValue: Math.round(currentBurst * 100) / 100,
            threshold: p3Threshold,
            hoursToBreech: Math.round(hoursToBreach * 10) / 10,
            confidence: Math.round(regression.r2 * 100),
            slope: Math.round(regression.slope * 100) / 100,
            message: `Burst capacity declining at ${Math.round(Math.abs(regression.slope) * 100) / 100}%/hr. Expected to hit ${p3Threshold}% in ~${Math.round(hoursToBreach * 10) / 10} hours.`
          });
        }
      }
    }
  } catch (e) {
    console.error('  Predictive analysis error:', e.message);
  }

  return warnings;
}

/**
 * Post predictive warnings to Slack
 */
async function postWarnings(warnings) {
  if (warnings.length === 0) return;

  const channel = await slack.getIncidentsChannel();

  for (const warning of warnings) {
    const emoji = warning.severity === 'P2' ? ':warning:' : ':crystal_ball:';
    await slack.postMessage(channel,
      `${emoji} *Predictive Alert: ${warning.resource}*\n` +
      `${warning.message}\n` +
      `Current: ${warning.currentValue}% | Threshold: ${warning.threshold}% | Confidence: ${warning.confidence}%\n` +
      `_This is an early warning — no incident created yet._`
    );
  }
}

module.exports = {
  collectMetricHistory,
  linearRegression,
  predictBreach,
  runPredictiveAnalysis,
  postWarnings
};
