#!/usr/bin/env node

/**
 * Slack Bot Commands Handler
 * Polls for slash commands and messages, responds to:
 * - /incident create <description> - Create manual incident
 * - /oncall who - Show current on-call
 * - /oncall schedule - Show rotation schedule
 * - /status - Show system status page
 * - /incidents list - List active incidents
 * - /runbook list - List available runbooks
 * - /runbook run <id> - Execute a runbook
 * - /slo status - Show SLO dashboard
 * - /maintenance list - Show maintenance windows
 * - /report weekly - Generate weekly report
 * - help - Show available commands
 */

const config = require('./config');
const slack = require('./utils/slack');
const oncall = require('./utils/oncall');
const analytics = require('./utils/analytics');
const statusPage = require('./utils/status_page');
const slo = require('./utils/slo');
const maintenance = require('./utils/maintenance');
const runbook = require('./utils/runbook');
const db = require('./utils/db');

/**
 * Handle a command message
 */
async function handleCommand(text, channelId, userId) {
  const parts = text.toLowerCase().trim().split(/\s+/);
  const cmd = parts[0];
  const sub = parts[1];

  switch (cmd) {
    case 'help':
      return handleHelp(channelId);

    case 'incident':
    case 'incidents':
      if (sub === 'create') return handleIncidentCreate(text, channelId, userId);
      if (sub === 'list' || sub === 'active') return handleIncidentList(channelId);
      return handleIncidentList(channelId);

    case 'oncall':
      if (sub === 'who') return handleOnCallWho(channelId);
      if (sub === 'schedule') return handleOnCallSchedule(channelId);
      if (sub === 'override') return handleOnCallOverride(parts, channelId, userId);
      return handleOnCallWho(channelId);

    case 'status':
      return handleStatus(channelId);

    case 'runbook':
    case 'runbooks':
      if (sub === 'list') return handleRunbookList(channelId);
      if (sub === 'run' && parts[2]) return handleRunbookRun(parseInt(parts[2]), channelId, userId);
      return handleRunbookList(channelId);

    case 'slo':
    case 'slos':
      return handleSLOStatus(channelId);

    case 'maintenance':
      if (sub === 'list') return handleMaintenanceList(channelId);
      return handleMaintenanceList(channelId);

    case 'report':
      if (sub === 'weekly') return handleWeeklyReport(channelId);
      if (sub === 'monthly') return handleMonthlyReport(channelId);
      return handleWeeklyReport(channelId);

    case 'metrics':
    case 'mttx':
    case 'dashboard':
      return handleDashboard(channelId);

    default:
      return null; // Not a command
  }
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleHelp(channelId) {
  return slack.postMessage(channelId,
    `:robot_face: *Incident Commander — Commands*\n\n` +
    `*Incidents*\n` +
    `\`incident list\` — Show active incidents\n` +
    `\`incident create <description>\` — Create manual incident\n\n` +
    `*On-Call*\n` +
    `\`oncall who\` — Show current on-call person\n` +
    `\`oncall schedule\` — Show rotation schedule\n\n` +
    `*Status*\n` +
    `\`status\` — Show system status page\n\n` +
    `*Runbooks*\n` +
    `\`runbook list\` — List available runbooks\n` +
    `\`runbook run <id>\` — Execute a runbook\n\n` +
    `*SLO & Metrics*\n` +
    `\`slo\` — Show SLO dashboard\n` +
    `\`metrics\` — Show MTTX dashboard\n\n` +
    `*Reports*\n` +
    `\`report weekly\` — Generate weekly report\n` +
    `\`report monthly\` — Generate monthly report\n\n` +
    `*Maintenance*\n` +
    `\`maintenance list\` — Show maintenance windows\n\n` +
    `_Tip: Type any command in the #incidents channel_`
  );
}

async function handleIncidentList(channelId) {
  const active = await db.getActiveIncidents();

  if (active.length === 0) {
    return slack.postMessage(channelId, ':white_check_mark: No active incidents.');
  }

  let text = `:rotating_light: *Active Incidents (${active.length})*\n\n`;
  for (const inc of active) {
    const severity = { P1: ':red_circle:', P2: ':large_orange_circle:', P3: ':large_yellow_circle:' };
    const elapsed = Math.round((Date.now() - new Date(inc.detected_at).getTime()) / 60000);
    text += `${severity[inc.severity] || ':white_circle:'} *${inc.incident_number}* — ${inc.status}\n`;
    text += `  ${inc.service_type}/${inc.resource_id} | ${inc.metric}=${inc.metric_value} | ${elapsed}m ago\n`;
    if (inc.war_room_channel) text += `  War Room: <#${inc.war_room_channel}>\n`;
    text += '\n';
  }

  return slack.postMessage(channelId, text);
}

async function handleIncidentCreate(text, channelId, userId) {
  const description = text.replace(/^incident\s+create\s*/i, '').trim();
  if (!description) {
    return slack.postMessage(channelId, ':warning: Usage: `incident create <description>`');
  }

  const incidentNumber = await db.getNextIncidentNumber();
  const record = await db.createIncident({
    incidentNumber,
    severity: 'P3',
    serviceType: 'manual',
    resourceId: 'user-reported',
    metric: 'manual',
    metricValue: 0,
    thresholdValue: 0,
    rawMetrics: { description }
  });

  await db.recordTimeline(record.id, 'created', `Manual incident created by <@${userId}>: ${description}`);

  return slack.postMessage(channelId,
    `:rotating_light: *${incidentNumber}* created (P3)\n${description}\nCreated by: <@${userId}>`
  );
}

async function handleOnCallWho(channelId) {
  const onCall = await oncall.getDefaultOnCall();

  if (!onCall || !onCall.userId) {
    return slack.postMessage(channelId,
      ':warning: No on-call schedule configured. Set up a schedule with the service catalog.'
    );
  }

  return slack.postMessage(channelId,
    `:telephone_receiver: *Current On-Call*\n` +
    `<@${onCall.userId}> (${onCall.userName || 'Unknown'})` +
    (onCall.isOverride ? `\n_Override: ${onCall.reason || 'shift swap'}_` : '')
  );
}

async function handleOnCallSchedule(channelId) {
  const schedules = await oncall.listSchedules();

  if (schedules.length === 0) {
    return slack.postMessage(channelId, ':warning: No on-call schedules configured.');
  }

  let text = `:calendar: *On-Call Schedules*\n\n`;
  for (const sched of schedules) {
    const current = await oncall.getCurrentOnCall(sched.id);
    text += `*${sched.name}* (${sched.rotation_type})\n`;
    text += `  Current: ${current ? `<@${current.userId}>` : 'None'}\n`;
    text += `  Members: ${sched.members.map(m => m.name).join(', ')}\n`;
    text += `  Handoff: ${sched.handoff_time} ${sched.timezone}\n\n`;
  }

  return slack.postMessage(channelId, text);
}

async function handleOnCallOverride(parts, channelId, userId) {
  return slack.postMessage(channelId,
    ':information_source: To create an on-call override, contact the schedule admin or use the API.'
  );
}

async function handleStatus(channelId) {
  return statusPage.postStatusSummary(channelId);
}

async function handleRunbookList(channelId) {
  const runbooks = await runbook.listRunbooks();

  if (runbooks.length === 0) {
    return slack.postMessage(channelId, ':book: No runbooks configured.');
  }

  let text = `:book: *Available Runbooks (${runbooks.length})*\n\n`;
  for (const rb of runbooks) {
    text += `*#${rb.id}* — ${rb.name}\n`;
    text += `  Service: ${rb.service_name || 'Any'} | Trigger: ${rb.trigger_metric || 'Manual'}\n`;
    text += `  Auto-execute: ${rb.auto_execute ? 'Yes' : 'No'} | Success rate: ${rb.success_rate}%\n`;
    text += `  Steps: ${rb.steps.length} | Runs: ${rb.execution_count}\n\n`;
  }

  return slack.postMessage(channelId, text);
}

async function handleRunbookRun(runbookId, channelId, userId) {
  await slack.postMessage(channelId, `:gear: Running runbook #${runbookId}...`);

  const result = await runbook.executeRunbook(runbookId, null, userId);
  if (!result) {
    return slack.postMessage(channelId, `:x: Runbook #${runbookId} not found.`);
  }

  const status = result.success ? ':white_check_mark: Success' : ':x: Failed';
  let text = `${status} — Runbook: *${result.runbookName}*\n\n`;

  for (const step of result.outputs) {
    const icon = step.status === 'completed' ? ':white_check_mark:' : step.status === 'blocked' ? ':no_entry:' : ':x:';
    text += `${icon} Step ${step.step}: ${step.name}\n`;
  }

  return slack.postMessage(channelId, text);
}

async function handleSLOStatus(channelId) {
  const slos = await slo.listSLOs();

  if (slos.length === 0) {
    return slack.postMessage(channelId, ':chart_with_upwards_trend: No SLOs configured.');
  }

  let text = `:chart_with_upwards_trend: *SLO Dashboard*\n\n`;
  for (const s of slos) {
    const status = await slo.getSLOStatus(s.service_name);
    for (const st of status) {
      const budgetPct = Math.round((st.errorBudgetRemaining || 0) * 100);
      const icon = st.isBreaching ? ':red_circle:' : budgetPct < 30 ? ':large_yellow_circle:' : ':large_green_circle:';
      text += `${icon} *${st.slo.name}* (${st.slo.service_name})\n`;
      text += `  Target: ${st.slo.target_value}% | Current: ${st.windowValue?.toFixed(2) || 'N/A'}%\n`;
      text += `  Error Budget: ${budgetPct}% remaining | Burn Rate: ${st.avgBurnRate.toFixed(1)}x\n\n`;
    }
  }

  return slack.postMessage(channelId, text);
}

async function handleMaintenanceList(channelId) {
  const windows = await maintenance.listUpcoming();

  if (windows.length === 0) {
    return slack.postMessage(channelId, ':wrench: No upcoming maintenance windows.');
  }

  let text = `:wrench: *Maintenance Windows*\n\n`;
  for (const w of windows) {
    const start = new Date(w.start_time).toLocaleString('en-US', { timeZone: config.TIMEZONE });
    const end = new Date(w.end_time).toLocaleString('en-US', { timeZone: config.TIMEZONE });
    const statusIcon = w.status === 'active' ? ':construction:' : ':clock3:';
    text += `${statusIcon} *${w.name}* (${w.status})\n`;
    text += `  ${start} → ${end}\n`;
    text += `  Services: ${(w.service_names || []).join(', ') || 'All'}\n\n`;
  }

  return slack.postMessage(channelId, text);
}

async function handleDashboard(channelId) {
  const metrics = await analytics.getMTTXMetrics(30);
  if (!metrics) {
    return slack.postMessage(channelId, ':bar_chart: No incident data available yet.');
  }

  const fmt = (s) => {
    if (!s) return 'N/A';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  return slack.postMessage(channelId,
    `:bar_chart: *MTTX Dashboard* (Last 30 days)\n\n` +
    `*Total Incidents:* ${metrics.totalIncidents}\n` +
    `P1: ${metrics.p1Count} | P2: ${metrics.p2Count} | P3: ${metrics.p3Count}\n\n` +
    `*Mean Time To Detect (MTTD):* ${fmt(metrics.avgMTTD)}\n` +
    `*Mean Time To Acknowledge (MTTA):* ${fmt(metrics.avgMTTA)}\n` +
    `*Mean Time To Resolve (MTTR):* ${fmt(metrics.avgMTTR)}\n` +
    `  P50: ${fmt(metrics.p50MTTR)} | P95: ${fmt(metrics.p95MTTR)}\n` +
    `  Best: ${fmt(metrics.minMTTR)} | Worst: ${fmt(metrics.maxMTTR)}\n\n` +
    `Auto-remediated: ${metrics.autoRemediatedCount}`
  );
}

async function handleWeeklyReport(channelId) {
  await slack.postMessage(channelId, ':hourglass: Generating weekly report...');
  return analytics.postWeeklyReport();
}

async function handleMonthlyReport(channelId) {
  await slack.postMessage(channelId, ':hourglass: Generating monthly report...');
  return analytics.postMonthlyReport();
}

/**
 * Poll Slack for bot commands
 * Listens in #incidents channel for messages directed at the bot
 */
async function pollForCommands() {
  const channelId = await slack.getIncidentsChannel();
  let lastTs = (Date.now() / 1000 - 5).toString(); // Start from 5 seconds ago

  console.log('Slack bot listening for commands in #incidents...');

  while (true) {
    try {
      const response = await fetch(
        `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${lastTs}&limit=10`,
        { headers: { 'Authorization': `Bearer ${config.SLACK_BOT_TOKEN}` } }
      );

      const data = await response.json();
      if (data.ok && data.messages) {
        for (const msg of data.messages.reverse()) {
          if (msg.bot_id) continue; // Skip bot messages
          const msgTs = parseFloat(msg.ts);
          if (msgTs <= parseFloat(lastTs)) continue;
          lastTs = msg.ts;

          const text = (msg.text || '').trim();
          if (text) {
            await handleCommand(text, channelId, msg.user);
          }
        }
      }
    } catch (e) {
      console.error('Command poll error:', e.message);
    }

    await new Promise(r => setTimeout(r, 3000)); // Poll every 3 seconds
  }
}

// Export for use as module or standalone
module.exports = { handleCommand, pollForCommands };

// Run standalone if called directly
if (require.main === module) {
  pollForCommands().catch(err => {
    console.error('Slack bot error:', err.message);
    process.exit(1);
  });
}
