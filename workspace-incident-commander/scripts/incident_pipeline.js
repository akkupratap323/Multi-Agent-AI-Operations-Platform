#!/usr/bin/env node

/**
 * Incident Pipeline Orchestrator (V2)
 * Chains stages 2-5 with new features:
 * - Similarity matching from past incidents
 * - Auto-remediation for P3 via runbooks
 * - Severity-based workflow routing
 * - On-call notification & escalation
 * - Status page updates
 * - Alert correlation
 */

const diagnose = require('./diagnose');
const respond = require('./respond');
const resolve = require('./resolve');
const postmortem = require('./postmortem');
const workflows = require('./utils/workflows');
const similarity = require('./utils/similarity');
const runbook = require('./utils/runbook');
const dedup = require('./utils/dedup');
const statusPage = require('./utils/status_page');
const oncall = require('./utils/oncall');
const db = require('./utils/db');

async function runPipeline(anomaly) {
  const startTime = Date.now();
  const workflow = workflows.getWorkflow(anomaly.severity);

  console.log('\n' + '═'.repeat(70));
  console.log(`🚨 INCIDENT PIPELINE V2 STARTED`);
  console.log(`   ${anomaly.severity} (${workflow.name}) | ${anomaly.serviceType}/${anomaly.resourceId} | ${anomaly.metric}=${anomaly.metricValue}`);
  console.log('═'.repeat(70));

  try {
    // Pre-Stage: Find similar past incidents
    console.log('\n📎 [SIMILARITY] Searching past incidents...');
    const similarIncidents = await similarity.findSimilar(anomaly);
    if (similarIncidents.length > 0) {
      console.log(`  Found ${similarIncidents.length} similar incident(s)`);
      const context = await similarity.getResolutionContext(similarIncidents);
      if (context && context.mostCommonFix) {
        console.log(`  Most common fix: ${context.mostCommonFix} (used ${context.mostCommonFixCount}x, avg MTTR: ${Math.round(context.avgMTTR / 60)}m)`);
      }
      anomaly.similarIncidents = similarIncidents;
      anomaly.resolutionContext = context;
    } else {
      console.log('  No similar incidents found');
    }

    // Pre-Stage: Correlate with other active alerts
    const correlatedAlerts = await dedup.correlateAlerts(anomaly);
    if (correlatedAlerts.length > 0) {
      console.log(`  🔗 Correlated with ${correlatedAlerts.length} related alert(s)`);
      anomaly.correlatedAlerts = correlatedAlerts;
    }

    // Pre-Stage: Get on-call info
    const onCallPerson = await oncall.getOnCallForService(anomaly.resourceId);
    anomaly.onCallPerson = onCallPerson;

    // Stage 2: Diagnosis
    const diagnosis = await diagnose.run(anomaly);
    if (!diagnosis) {
      console.error('[PIPELINE] Diagnosis failed — aborting pipeline');
      return;
    }

    // Link alert group to incident
    if (anomaly.alertGroupId) {
      await dedup.linkToIncident(anomaly.alertGroupId, diagnosis.incidentId);
    }

    // Update status page
    if (workflows.shouldPerformAction(anomaly.severity, 'updateStatusPage')) {
      try {
        await statusPage.updateFromIncident({
          severity: anomaly.severity,
          resourceId: anomaly.resourceId,
          metric: anomaly.metric,
          metricValue: anomaly.metricValue,
          incidentId: diagnosis.incidentId
        });
      } catch (e) {
        console.log('  Status page update skipped:', e.message);
      }
    }

    // Check for auto-remediation via runbooks (P3 only)
    if (workflows.isAutoRemediationEnabled(anomaly.severity)) {
      console.log('\n🤖 [AUTO-REMEDIATE] Checking runbooks...');
      const matchingRunbooks = await runbook.findRunbooks(anomaly);
      const autoRunbook = matchingRunbooks.find(rb => rb.auto_execute);

      if (autoRunbook) {
        console.log(`  Found auto-execute runbook: ${autoRunbook.name}`);
        const rbResult = await runbook.executeRunbook(autoRunbook.id, diagnosis.incidentId, 'auto');

        if (rbResult && rbResult.success) {
          console.log('  Auto-remediation succeeded!');

          await db.updateIncident(diagnosis.incidentId, {
            status: 'resolved',
            autoRemediated: true,
            approver: 'auto-runbook',
            fixResult: `Auto-remediated via runbook: ${autoRunbook.name}`,
            resolvedAt: new Date().toISOString(),
            mttrSeconds: Math.round((Date.now() - startTime) / 1000)
          });

          await db.recordTimeline(diagnosis.incidentId, 'auto_remediated',
            `Auto-remediated via runbook: ${autoRunbook.name}`
          );

          const slack = require('./utils/slack');
          const channel = await slack.getIncidentsChannel();
          await slack.postMessage(channel,
            `🤖 *Auto-Remediated — ${diagnosis.incidentNumber}* (${anomaly.severity})\n` +
            `${anomaly.serviceType}/${anomaly.resourceId} | ${anomaly.metric}=${anomaly.metricValue}\n` +
            `Runbook: ${autoRunbook.name} | MTTR: ${Math.round((Date.now() - startTime) / 1000)}s`
          );

          try { await statusPage.resolveStatus(anomaly.resourceId, diagnosis.incidentId); } catch (e) {}
          if (anomaly.alertGroupId) await dedup.resolveGroup(anomaly.alertGroupId);

          console.log('\n' + '═'.repeat(70));
          console.log(`✅ AUTO-REMEDIATED ${diagnosis.incidentNumber} in ${Math.round((Date.now() - startTime) / 1000)}s`);
          console.log('═'.repeat(70) + '\n');
          return;
        } else {
          console.log('  Auto-remediation failed, falling through to manual flow');
        }
      }
    }

    // Stage 3: Response (notify all channels)
    const response = await respond.run(diagnosis);

    // Stage 4: Resolution (blocks until human approval or timeout)
    const resolution = await resolve.run(diagnosis, response);

    // Post-resolution cleanup
    if (resolution.resolved) {
      try { await statusPage.resolveStatus(anomaly.resourceId, diagnosis.incidentId); } catch (e) {}
      if (anomaly.alertGroupId) await dedup.resolveGroup(anomaly.alertGroupId);
    }

    // Stage 5: Postmortem (based on workflow)
    if (resolution.resolved && !resolution.rejected && workflows.shouldPerformAction(anomaly.severity, 'generatePostmortem')) {
      await postmortem.run(diagnosis.incidentId);
    } else {
      console.log('[PIPELINE] Skipping postmortem (not required for this severity/status)');
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log('\n' + '═'.repeat(70));
    console.log(`✅ PIPELINE COMPLETE for ${diagnosis.incidentNumber} (${elapsed}s total)`);
    console.log('═'.repeat(70) + '\n');

  } catch (error) {
    console.error(`[PIPELINE] Fatal error: ${error.message}`);
    console.error(error.stack);
  }
}

module.exports = { runPipeline };
