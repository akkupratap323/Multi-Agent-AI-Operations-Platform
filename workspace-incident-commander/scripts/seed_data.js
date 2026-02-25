#!/usr/bin/env node

/**
 * Seed Data - Populates initial configuration:
 * - On-call schedule for Nester Labs team
 * - Escalation policy
 * - Service catalog entry for nester-ai-emotion
 * - Default runbooks for Lightsail
 * - SLO definitions
 * - Status page components
 */

const oncall = require('./utils/oncall');
const serviceCatalog = require('./utils/service_catalog');
const runbook = require('./utils/runbook');
const slo = require('./utils/slo');
const statusPage = require('./utils/status_page');

async function seed() {
  console.log('🌱 Seeding initial data...\n');

  // 1. On-Call Schedule
  console.log('📅 Creating on-call schedule...');
  const schedule = await oncall.createSchedule({
    name: 'Nester Labs Engineering',
    timezone: 'Asia/Kolkata',
    rotationType: 'weekly',
    handoffTime: '09:00',
    handoffDay: 1, // Monday
    members: [
      { name: 'Aditya', slackId: 'U0AFZ4RNNM6', email: 'aditya@nesterlabs.com', phone: '+918005729753' }
    ]
  });
  console.log(`  Created: ${schedule.name} (ID: ${schedule.id})`);

  // 2. Escalation Policy
  console.log('\n⬆️ Creating escalation policy...');
  const escalation = await oncall.createEscalationPolicy({
    name: 'Default Escalation',
    description: 'Escalate through on-call, then to team lead',
    rules: [
      {
        level: 1,
        targets: [{ type: 'schedule', id: String(schedule.id) }],
        timeoutMinutes: 5
      },
      {
        level: 2,
        targets: [{ type: 'user', id: 'U0AFZ4RNNM6' }], // Aditya as fallback
        timeoutMinutes: 10
      },
      {
        level: 3,
        targets: [{ type: 'user', id: 'U0AFZ4RNNM6' }], // Final escalation
        timeoutMinutes: 15
      }
    ],
    repeatCount: 2,
    repeatInterval: 5
  });
  console.log(`  Created: ${escalation.name} (ID: ${escalation.id})`);

  // 3. Service Catalog
  console.log('\n📋 Registering services...');
  const service = await serviceCatalog.registerService({
    name: 'nester-ai-emotion',
    displayName: 'Nester AI Emotion Engine',
    description: 'AI-powered emotion detection, STT, and TTS service running on Lightsail',
    serviceType: 'lightsail',
    resourceId: 'nester-ai-emotion',
    ownerSlackId: 'U0AFZ4RNNM6',
    ownerName: 'Aditya',
    team: 'Engineering',
    tier: 'tier1',
    escalationPolicyId: escalation.id,
    onCallScheduleId: schedule.id,
    slackChannel: 'incidents',
    repoUrl: 'https://github.com/nesterlabs-ai/NesterAIBot',
    tags: ['production', 'ai', 'lightsail', 'emotion-detection']
  });
  console.log(`  Registered: ${service.name} (Tier: ${service.tier})`);

  // 4. Runbooks
  console.log('\n📖 Creating runbooks...');

  const rb1 = await runbook.createRunbook({
    name: 'Lightsail Instance Restart',
    description: 'Restart a Lightsail instance to clear transient issues',
    serviceName: 'nester-ai-emotion',
    triggerMetric: 'CPUUtilization',
    triggerSeverity: 'P3',
    autoExecute: true, // Auto-execute for P3
    steps: [
      {
        name: 'Reboot instance',
        command: 'aws lightsail reboot-instance --instance-name nester-ai-emotion --region us-west-2',
        timeout_ms: 30000,
        continue_on_failure: false
      },
      {
        name: 'Wait for instance to come back',
        command: 'sleep 60 && aws lightsail get-instance-state --instance-name nester-ai-emotion --region us-west-2',
        timeout_ms: 90000,
        continue_on_failure: true
      }
    ],
    tags: ['lightsail', 'restart', 'cpu']
  });
  console.log(`  Created: ${rb1.name} (ID: ${rb1.id}, auto-execute: true)`);

  const rb2 = await runbook.createRunbook({
    name: 'Lightsail Instance Scale Up',
    description: 'Upgrade Lightsail instance to larger bundle',
    serviceName: 'nester-ai-emotion',
    triggerMetric: 'CPUUtilization',
    triggerSeverity: 'P2',
    autoExecute: false,
    steps: [
      {
        name: 'Stop instance',
        command: 'aws lightsail stop-instance --instance-name nester-ai-emotion --region us-west-2',
        timeout_ms: 60000,
        continue_on_failure: false
      },
      {
        name: 'Wait for stop',
        command: 'sleep 30 && aws lightsail get-instance-state --instance-name nester-ai-emotion --region us-west-2',
        timeout_ms: 45000,
        continue_on_failure: true
      },
      {
        name: 'Start instance (after manual bundle update)',
        command: 'aws lightsail start-instance --instance-name nester-ai-emotion --region us-west-2',
        timeout_ms: 30000,
        continue_on_failure: false
      }
    ],
    tags: ['lightsail', 'scale', 'cpu']
  });
  console.log(`  Created: ${rb2.name} (ID: ${rb2.id})`);

  const rb3 = await runbook.createRunbook({
    name: 'Lightsail Health Diagnostics',
    description: 'Gather diagnostic info from a Lightsail instance',
    serviceName: null, // Applies to any service
    triggerMetric: null,
    triggerSeverity: null,
    autoExecute: false,
    steps: [
      {
        name: 'Check instance status',
        command: 'aws lightsail get-instance --instance-name nester-ai-emotion --region us-west-2',
        timeout_ms: 15000,
        continue_on_failure: true
      },
      {
        name: 'Get recent metrics',
        command: 'aws lightsail get-instance-metric-data --instance-name nester-ai-emotion --metric-name CPUUtilization --period 300 --start-time "$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --unit Percent --statistics Average --region us-west-2',
        timeout_ms: 15000,
        continue_on_failure: true
      }
    ],
    tags: ['lightsail', 'diagnostics']
  });
  console.log(`  Created: ${rb3.name} (ID: ${rb3.id})`);

  // 5. SLO Definitions
  console.log('\n📊 Creating SLO definitions...');

  const slo1 = await slo.createSLO({
    name: 'Nester AI Uptime',
    serviceName: 'nester-ai-emotion',
    metricType: 'uptime',
    targetValue: 99.9,
    windowType: 'rolling',
    windowDays: 30,
    alertBurnRate: 1.0,
    description: 'Target 99.9% uptime for nester-ai-emotion service (43.8 min downtime/month allowed)'
  });
  console.log(`  Created: ${slo1.name} (Target: ${slo1.target_value}%)`);

  const slo2 = await slo.createSLO({
    name: 'Nester AI CPU Health',
    serviceName: 'nester-ai-emotion',
    metricType: 'cpu_health',
    targetValue: 95.0,
    windowType: 'rolling',
    windowDays: 7,
    alertBurnRate: 2.0,
    description: 'CPU should stay below threshold 95% of the time'
  });
  console.log(`  Created: ${slo2.name} (Target: ${slo2.target_value}%)`);

  // 6. Status Page Components
  console.log('\n🟢 Creating status page components...');

  await statusPage.registerComponent({
    name: 'Nester AI Emotion Engine',
    description: 'Core emotion detection, STT, and TTS service',
    serviceName: 'nester-ai-emotion',
    displayOrder: 1,
    status: 'operational'
  });
  console.log('  Created: Nester AI Emotion Engine');

  await statusPage.registerComponent({
    name: 'API Gateway',
    description: 'REST API endpoint',
    serviceName: 'api',
    displayOrder: 2,
    status: 'operational'
  });
  console.log('  Created: API Gateway');

  await statusPage.registerComponent({
    name: 'Database',
    description: 'PostgreSQL database',
    serviceName: 'database',
    displayOrder: 3,
    status: 'operational'
  });
  console.log('  Created: Database');

  console.log('\n✅ Seed data complete!');
  console.log('\nSummary:');
  console.log(`  On-Call Schedule: ${schedule.name}`);
  console.log(`  Escalation Policy: ${escalation.name}`);
  console.log(`  Services: 1 registered`);
  console.log(`  Runbooks: 3 created (1 auto-execute)`);
  console.log(`  SLOs: 2 defined`);
  console.log(`  Status Page: 3 components`);

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
