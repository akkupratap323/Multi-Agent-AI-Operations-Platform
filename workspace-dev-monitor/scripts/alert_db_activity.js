#!/usr/bin/env node

/**
 * Database Activity Alerts
 * Monitors for new entries and sends real-time alerts
 */

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

// Projects to monitor
const MONITOR_PROJECTS = [
  'round-mud-51957752', // Ultron - your active project
];

async function fetchNeonAPI(endpoint) {
  try {
    const response = await fetch(`${NEON_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${NEON_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Neon API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error.message);
    return null;
  }
}

async function checkProjectActivity(projectId) {
  console.log(`🔍 Checking activity for project: ${projectId}`);

  const alerts = [];

  // Get project details
  const projectData = await fetchNeonAPI(`/projects/${projectId}`);
  if (!projectData || !projectData.project) {
    console.log('  ❌ Could not fetch project');
    return alerts;
  }

  const project = projectData.project;
  const projectName = project.name || projectId;

  // Check recent operations (last 1 hour)
  const operations = await fetchNeonAPI(`/projects/${projectId}/operations`);

  if (operations && operations.operations) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentOps = operations.operations.filter(op => {
      const opTime = new Date(op.created_at).getTime();
      return opTime > oneHourAgo;
    });

    console.log(`  Found ${recentOps.length} operations in last hour`);

    // Alert on important operations
    recentOps.forEach(op => {
      if (op.action === 'start_compute' || op.action === 'suspend_compute') {
        alerts.push({
          type: 'compute',
          project: projectName,
          action: op.action,
          status: op.status,
          time: op.created_at,
          severity: 'low'
        });
      }

      if (op.action === 'create_branch' || op.action === 'delete_branch') {
        alerts.push({
          type: 'schema',
          project: projectName,
          action: op.action,
          status: op.status,
          time: op.created_at,
          severity: 'medium'
        });
      }

      if (op.status === 'failed' || op.status === 'error') {
        alerts.push({
          type: 'error',
          project: projectName,
          action: op.action,
          status: op.status,
          time: op.created_at,
          severity: 'high'
        });
      }
    });
  }

  // Check consumption for high usage alerts
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const from = oneHourAgo.toISOString();
  const to = now.toISOString();

  const consumption = await fetchNeonAPI(`/projects/${projectId}/consumption?from=${from}&to=${to}&granularity=hourly`);

  if (consumption && consumption.periods && consumption.periods.length > 0) {
    const period = consumption.periods[0];

    // Alert on high compute usage (>1 hour in last hour = continuous usage)
    if (period.compute_time_seconds && period.compute_time_seconds > 3000) {
      alerts.push({
        type: 'usage',
        project: projectName,
        action: 'high_compute_usage',
        details: `${(period.compute_time_seconds / 3600).toFixed(2)} hours`,
        severity: 'medium'
      });
    }

    // Alert on high data writes
    if (period.written_data_bytes && period.written_data_bytes > 100 * 1024 * 1024) { // >100MB
      alerts.push({
        type: 'usage',
        project: projectName,
        action: 'high_data_writes',
        details: `${(period.written_data_bytes / (1024 * 1024)).toFixed(2)} MB`,
        severity: 'medium'
      });
    }
  }

  // Check endpoint states
  const endpoints = await fetchNeonAPI(`/projects/${projectId}/endpoints`);

  if (endpoints && endpoints.endpoints) {
    endpoints.endpoints.forEach(endpoint => {
      // Alert if endpoint is in unexpected state
      if (endpoint.current_state === 'init' || endpoint.current_state === 'error') {
        alerts.push({
          type: 'endpoint',
          project: projectName,
          action: `endpoint_${endpoint.current_state}`,
          details: `Endpoint ${endpoint.id.substring(0, 12)}...`,
          severity: endpoint.current_state === 'error' ? 'high' : 'medium'
        });
      }

      // Alert if endpoint just became active
      if (endpoint.current_state === 'active') {
        const lastUpdate = new Date(endpoint.updated_at).getTime();
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        if (lastUpdate > fiveMinutesAgo) {
          alerts.push({
            type: 'activity',
            project: projectName,
            action: 'endpoint_active',
            details: `Endpoint ${endpoint.id.substring(0, 12)}... is now active`,
            severity: 'low'
          });
        }
      }
    });
  }

  return alerts;
}

async function sendAlertToSlack(alert) {
  const severityEmoji = {
    'high': '🔴',
    'medium': '🟡',
    'low': '🟢'
  };

  const emoji = severityEmoji[alert.severity] || '📌';

  let message = `${emoji} *Database Alert*\n\n`;
  message += `*Project:* ${alert.project}\n`;
  message += `*Type:* ${alert.type}\n`;
  message += `*Action:* ${alert.action.replace(/_/g, ' ')}\n`;

  if (alert.status) {
    message += `*Status:* ${alert.status}\n`;
  }

  if (alert.details) {
    message += `*Details:* ${alert.details}\n`;
  }

  if (alert.time) {
    const time = new Date(alert.time);
    message += `*Time:* ${time.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST\n`;
  }

  if (alert.severity === 'high') {
    message += `\ncc: @here - Requires attention!`;
  }

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        text: message
      })
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`  ✅ Alert sent: ${alert.action}`);
    } else {
      console.log(`  ⚠️  Failed to send alert: ${data.error}`);
    }
  } catch (error) {
    console.log(`  ⚠️  Could not send alert: ${error.message}`);
  }
}

async function main() {
  console.log('🔍 Database Activity Monitor');
  console.log('═'.repeat(60));
  console.log(`Monitoring ${MONITOR_PROJECTS.length} project(s)...\n`);

  let totalAlerts = 0;

  for (const projectId of MONITOR_PROJECTS) {
    const alerts = await checkProjectActivity(projectId);

    if (alerts.length > 0) {
      console.log(`\n⚠️  Found ${alerts.length} alert(s):\n`);

      for (const alert of alerts) {
        console.log(`  ${alert.severity.toUpperCase()}: ${alert.action} in ${alert.project}`);

        // Send high and medium severity alerts immediately
        if (alert.severity === 'high' || alert.severity === 'medium') {
          await sendAlertToSlack(alert);
        }

        totalAlerts++;
      }
    } else {
      console.log(`  ✅ No alerts for this project`);
    }

    console.log('');
  }

  if (totalAlerts === 0) {
    console.log('✨ All systems normal - no alerts!');
  } else {
    console.log(`\n📊 Total alerts: ${totalAlerts}`);
  }

  console.log('\n✨ Monitoring complete!');
}

main().catch(console.error);
