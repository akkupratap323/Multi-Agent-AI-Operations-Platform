#!/usr/bin/env node

/**
 * Test script - Simulates an incident to test the full pipeline
 * Fires a fake P2 anomaly for nester-ai-emotion
 */

const cw = require('./utils/cloudwatch');

async function test() {
  console.log('🧪 Fetching real metrics for test...');
  const instances = cw.listLightsailInstances();

  if (instances.length === 0) {
    console.error('No Lightsail instances found');
    process.exit(1);
  }

  const inst = instances[0];
  const metrics = cw.getLightsailInstanceMetrics(inst.name);

  console.log(`Instance: ${inst.name}`);
  console.log(`Real CPU: ${metrics.CPUUtilization}%`);
  console.log('');
  console.log('🚨 Simulating P2 CPU spike...');

  // Create a fake anomaly with real instance data but fake high CPU
  const fakeAnomaly = {
    serviceType: 'lightsail',
    resourceId: inst.name,
    resourceName: inst.name,
    metric: 'CPUUtilization',
    metricValue: 87.5,  // Fake high CPU
    thresholdValue: 85,  // P2 threshold
    severity: 'P2',
    rawMetrics: { ...metrics, CPUUtilization: 87.5 },
    extra: {
      ip: inst.ip,
      blueprint: inst.blueprint,
      bundle: inst.bundle,
      cpuCount: inst.cpuCount,
      ramGb: inst.ramGb
    }
  };

  console.log(`Anomaly: ${fakeAnomaly.severity} | ${fakeAnomaly.serviceType}/${fakeAnomaly.resourceId} | CPU=${fakeAnomaly.metricValue}%`);
  console.log('');
  console.log('🚀 Starting incident pipeline...');
  console.log('');

  const { runPipeline } = require('./incident_pipeline');
  await runPipeline(fakeAnomaly);
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
