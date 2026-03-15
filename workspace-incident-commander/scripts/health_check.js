#!/usr/bin/env node

/**
 * Health Check - validates that the fix worked by re-checking the breached metric
 */

const config = require('./config');
const cw = require('./utils/cloudwatch');

/**
 * Check if the metric that triggered the incident is now back to normal
 */
function check(diagnosis) {
  const { serviceType, resourceId, metric, thresholdValue, severity, extra } = diagnosis;

  let currentValue = null;
  let details = '';

  try {
    switch (serviceType) {
      case 'lightsail': {
        const metrics = cw.getLightsailInstanceMetrics(resourceId);
        currentValue = metrics[metric];
        details = `Lightsail ${resourceId}: ${metric} = ${currentValue}`;
        break;
      }

      case 'lightsail_db': {
        const metrics = cw.getLightsailDBMetrics(resourceId);
        currentValue = metrics[metric];
        details = `Lightsail DB ${resourceId}: ${metric} = ${currentValue}`;
        break;
      }

      case 'ec2': {
        const metrics = cw.getEC2Metrics(resourceId);
        currentValue = metrics[metric];
        details = `EC2 ${resourceId}: ${metric} = ${currentValue}`;
        break;
      }
    }
  } catch (error) {
    return {
      healthy: false,
      currentValue: null,
      details: `Health check error: ${error.message}`
    };
  }

  if (currentValue === null || currentValue === undefined) {
    return {
      healthy: false,
      currentValue: null,
      details: `Could not retrieve ${metric} for ${serviceType}/${resourceId}`
    };
  }

  // Determine if the metric is now within acceptable bounds
  const isInverted = config.INVERTED_METRICS.includes(metric);
  const t = config.THRESHOLDS[serviceType]?.[metric];

  // Use the P3 threshold as the "acceptable" boundary
  const acceptableThreshold = t ? (t.p3 || t.p2 || t.p1) : thresholdValue;

  let healthy;
  if (isInverted) {
    healthy = currentValue > acceptableThreshold;
  } else {
    healthy = currentValue < acceptableThreshold;
  }

  currentValue = Math.round(currentValue * 100) / 100;

  return {
    healthy,
    currentValue,
    details: `${details} | ${healthy ? 'PASS' : 'FAIL'} (threshold: ${acceptableThreshold})`
  };
}

module.exports = { check };
