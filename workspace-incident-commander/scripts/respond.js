#!/usr/bin/env node

/**
 * Stage 3: Respond (V2)
 * Enhanced with: on-call paging, severity workflows, similar incidents context,
 * alert correlation info, status page updates
 */

const config = require('./config');
const slack = require('./utils/slack');
const whatsapp = require('./utils/whatsapp');
const email = require('./utils/email');
const db = require('./utils/db');
const oncall = require('./utils/oncall');
const workflows = require('./utils/workflows');

async function run(diagnosis) {
  const workflow = workflows.getWorkflow(diagnosis.severity);
  console.log(`\n🚨 [RESPOND] Notifying for ${diagnosis.incidentNumber} (${workflow.name} workflow)`);

  // 1. Get or create the #incidents channel
  const incidentsChannel = await slack.getIncidentsChannel();

  // 2. Create war room channel (if workflow requires it)
  let warRoomChannel = null;
  let warRoomName = null;

  if (workflows.shouldPerformAction(diagnosis.severity, 'createWarRoom')) {
    const dateStr = new Date().toISOString().split('T')[0];
    warRoomName = `incident-${dateStr}-${diagnosis.incidentNumber.split('-').pop()}`;
    warRoomChannel = await slack.createChannel(warRoomName);

    if (warRoomChannel) {
      await slack.setChannelTopic(warRoomChannel, `${diagnosis.severity} | ${diagnosis.serviceType}/${diagnosis.resourceId} | ${diagnosis.metric}`);

      // Invite on-call person
      if (diagnosis.onCallPerson && diagnosis.onCallPerson.userId) {
        await slack.inviteToChannel(warRoomChannel, [diagnosis.onCallPerson.userId]);
      } else if (config.ON_CALL_SLACK_USER) {
        await slack.inviteToChannel(warRoomChannel, [config.ON_CALL_SLACK_USER]);
      }
    }
  }

  const activeWarRoom = warRoomChannel || incidentsChannel;

  // 3. Post incident card to war room / incidents channel
  console.log('  Posting incident card...');
  const warRoomPost = await slack.postIncidentCard(activeWarRoom, diagnosis);

  // 4. Add similar incidents context if available
  if (diagnosis.similarIncidents && diagnosis.similarIncidents.length > 0) {
    const simText = diagnosis.similarIncidents.slice(0, 3).map(s =>
      `• *${s.incidentNumber}* (${s.matchType}) — ${(s.rootCause || '').substring(0, 80)}${s.mttrSeconds ? ` | MTTR: ${Math.round(s.mttrSeconds / 60)}m` : ''}`
    ).join('\n');

    await slack.postMessage(activeWarRoom,
      `:mag: *Similar Past Incidents:*\n${simText}`
    );

    if (diagnosis.resolutionContext && diagnosis.resolutionContext.mostCommonFix) {
      await slack.postMessage(activeWarRoom,
        `:bulb: *Suggested from history:* ${diagnosis.resolutionContext.mostCommonFix}\n` +
        `Used ${diagnosis.resolutionContext.mostCommonFixCount}x before | Avg MTTR: ${Math.round(diagnosis.resolutionContext.avgMTTR / 60)}m`
      );
    }
  }

  // 5. Add correlated alerts info
  if (diagnosis.correlatedAlerts && diagnosis.correlatedAlerts.length > 0) {
    const corrText = diagnosis.correlatedAlerts.map(a =>
      `• ${a.service} (${a.isCritical ? 'critical dependency' : 'dependency'}) — ${a.alertCount} alert(s)`
    ).join('\n');

    await slack.postMessage(activeWarRoom,
      `:link: *Correlated Alerts:*\n${corrText}\n_These services may be affected by the same root cause._`
    );
  }

  // 6. Post to main incidents channel
  if (warRoomChannel && incidentsChannel !== activeWarRoom) {
    const alertSummary =
      `${workflow.slackEmoji} *${diagnosis.severity} INCIDENT — ${diagnosis.incidentNumber}*\n` +
      `Service: ${diagnosis.serviceType}/${diagnosis.resourceId} | ${diagnosis.metric}=${diagnosis.metricValue}\n` +
      `Root Cause: ${(diagnosis.rootCause || '').substring(0, 150)}\n` +
      `War Room: <#${warRoomChannel}>`;

    await slack.postMessage(incidentsChannel, alertSummary);
  }

  // 7. Page on-call person
  if (workflows.shouldPerformAction(diagnosis.severity, 'pageOnCall')) {
    if (diagnosis.onCallPerson && diagnosis.onCallPerson.userId) {
      await slack.postMessage(activeWarRoom,
        `:pager: <@${diagnosis.onCallPerson.userId}> — You are being paged for ${diagnosis.incidentNumber} (${diagnosis.severity})`
      );
      await db.recordTimeline(diagnosis.incidentId, 'paged_oncall',
        `Paged on-call: ${diagnosis.onCallPerson.userName || diagnosis.onCallPerson.userId}`
      );
    }
  }

  // 8. WhatsApp alert (based on workflow)
  if (workflows.shouldPerformAction(diagnosis.severity, 'notifyWhatsApp')) {
    console.log('  Sending WhatsApp alert...');
    const whatsappMsg = whatsapp.formatIncidentAlert(diagnosis);
    whatsapp.sendAlert(whatsappMsg);
    await db.recordTimeline(diagnosis.incidentId, 'notified_whatsapp', `WhatsApp alert sent to ${config.WHATSAPP_TO}`);
  }

  // 9. Email stakeholders (based on workflow)
  if (workflows.shouldPerformAction(diagnosis.severity, 'notifyEmail')) {
    console.log('  Sending email notification...');
    const { subject, body } = email.formatIncidentEmail(diagnosis);
    const emailSent = await email.sendIncidentEmail(config.STAKEHOLDER_EMAILS, subject, body);
    if (emailSent) {
      await db.recordTimeline(diagnosis.incidentId, 'notified_email', `Email sent to ${config.STAKEHOLDER_EMAILS.join(', ')}`);
    }
  }

  // 10. Update DB
  await db.updateIncident(diagnosis.incidentId, {
    status: 'responding',
    warRoomChannel: activeWarRoom,
    respondedAt: new Date().toISOString(),
    onCallUser: diagnosis.onCallPerson?.userId || null
  });

  await db.recordTimeline(diagnosis.incidentId, 'notified_slack',
    `Incident card posted to ${warRoomChannel ? `war room #${warRoomName}` : 'incidents channel'}`
  );

  console.log(`  Response complete. War room: #${warRoomName || 'incidents'}`);

  return {
    warRoomChannel: activeWarRoom,
    warRoomName,
    alertMessageTs: warRoomPost?.ts,
    incidentsChannel
  };
}

module.exports = { run };
