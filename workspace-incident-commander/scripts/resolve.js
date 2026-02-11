#!/usr/bin/env node

/**
 * Stage 4: Resolve
 * Posts fix options in war room, polls for human approval, executes fix, runs health check
 */

const { execSync } = require('child_process');
const config = require('./config');
const slack = require('./utils/slack');
const db = require('./utils/db');

/**
 * Execute an approved fix via AWS CLI
 */
function executeFix(fix, diagnosis) {
  console.log(`  Executing fix: ${fix.description}`);

  if (!fix.command || fix.command === 'Manual action required') {
    return { success: false, output: 'No automated command available. Manual intervention required.' };
  }

  try {
    // Safety: only allow specific AWS CLI commands
    const cmd = fix.command;
    const allowedPrefixes = [
      // Lightsail
      'aws lightsail reboot-instance',
      'aws lightsail stop-instance',
      'aws lightsail start-instance',
      'aws lightsail update-instance-bundle',
      'aws lightsail create-instance-from-snapshot',
      'aws lightsail reboot-relational-database',
      'aws lightsail update-relational-database',
      // EC2
      'aws ec2 reboot-instances',
      'aws autoscaling set-desired-capacity',
      // ECS
      'aws ecs update-service',
      // Lambda
      'aws lambda update-function-configuration',
      'aws lambda update-alias',
      // ElastiCache
      'aws elasticache reboot-cache-cluster'
    ];

    const isAllowed = allowedPrefixes.some(prefix => cmd.startsWith(prefix));
    if (!isAllowed) {
      return { success: false, output: `Command blocked by safety filter: ${cmd}` };
    }

    const output = execSync(`${cmd} --region ${config.AWS_REGION} --output json`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000
    });

    return { success: true, output: output.substring(0, 1000) };
  } catch (error) {
    return { success: false, output: error.message.substring(0, 500) };
  }
}

/**
 * Run the resolution stage
 */
async function run(diagnosis, response) {
  console.log(`\n🔧 [RESOLVE] Awaiting approval for ${diagnosis.incidentNumber}`);

  const warRoom = response.warRoomChannel;
  const fixes = diagnosis.suggestedFixes || [];

  if (fixes.length === 0) {
    await slack.postMessage(warRoom,
      `⚠️ No automated fixes available for this incident. Manual investigation required.\n` +
      `Reply \`resolve\` when the issue is fixed manually.`
    );

    // Still poll for manual resolution acknowledgment
    const manualResult = await slack.pollForApproval(warRoom, response.alertMessageTs, config.APPROVAL_TIMEOUT_MINUTES);
    if (manualResult.approved || (manualResult.timedOut === undefined)) {
      await db.updateIncident(diagnosis.incidentId, {
        status: 'resolved',
        approver: manualResult.approver || 'manual',
        resolvedAt: new Date().toISOString(),
        mttrSeconds: Math.round((Date.now() - new Date(diagnosis.detectedAt || Date.now()).getTime()) / 1000)
      });
      await db.recordTimeline(diagnosis.incidentId, 'resolved', 'Manually resolved');
    }

    return { resolved: manualResult.approved, manual: true };
  }

  // Post fix options
  const fixList = fixes.map((fix, i) =>
    `*${i + 1}.* ${fix.description} _(${fix.risk} risk)_\n    \`${fix.command || 'manual'}\``
  ).join('\n\n');

  const fixPost = await slack.postMessage(warRoom,
    `🔧 *Suggested Fixes for ${diagnosis.incidentNumber}:*\n\n${fixList}\n\n` +
    `Reply \`approve 1\` to execute fix #1, \`approve 2\` for fix #2, etc.\n` +
    `Reply \`reject\` to dismiss this incident.`
  );

  await db.updateIncident(diagnosis.incidentId, { status: 'awaiting_approval' });
  await db.recordTimeline(diagnosis.incidentId, 'fix_suggested', `${fixes.length} fix options presented for approval`);

  // Poll for approval
  console.log(`  Polling for approval (timeout: ${config.APPROVAL_TIMEOUT_MINUTES} min)...`);
  const approval = await slack.pollForApproval(warRoom, fixPost?.ts || response.alertMessageTs, config.APPROVAL_TIMEOUT_MINUTES);

  if (!approval.approved) {
    if (approval.timedOut) {
      await slack.postMessage(warRoom, `⏰ *Approval timed out* for ${diagnosis.incidentNumber}. Incident remains open.`);
      await db.recordTimeline(diagnosis.incidentId, 'approval_timeout', 'No approval received within timeout period');
    } else {
      await slack.postMessage(warRoom, `❌ *Incident ${diagnosis.incidentNumber} rejected* by <@${approval.approver}>. No action taken.`);
      await db.updateIncident(diagnosis.incidentId, { status: 'resolved', approver: approval.approver, resolvedAt: new Date().toISOString() });
      await db.recordTimeline(diagnosis.incidentId, 'rejected', `Rejected by ${approval.approver}`);
    }
    return { resolved: !approval.timedOut, rejected: !approval.timedOut };
  }

  // Execute the approved fix
  const fixIndex = approval.fixIndex;
  const selectedFix = fixes[fixIndex] || fixes[0];

  await db.updateIncident(diagnosis.incidentId, {
    status: 'executing_fix',
    approvedFix: fixIndex,
    approver: approval.approver,
    approvedAt: new Date().toISOString()
  });

  await db.recordTimeline(diagnosis.incidentId, 'fix_approved',
    `Fix #${fixIndex + 1} approved by ${approval.approver}: ${selectedFix.description}`
  );

  await slack.postMessage(warRoom,
    `✅ *Fix #${fixIndex + 1} approved by <@${approval.approver}>*\n` +
    `Executing: ${selectedFix.description}...`
  );

  // Execute
  const execResult = executeFix(selectedFix, diagnosis);

  await db.recordTimeline(diagnosis.incidentId, execResult.success ? 'fix_completed' : 'fix_failed',
    `${execResult.success ? 'Successfully executed' : 'Failed to execute'}: ${selectedFix.description}`,
    { output: execResult.output }
  );

  if (!execResult.success) {
    await slack.postMessage(warRoom,
      `❌ *Fix execution failed:*\n\`\`\`${execResult.output}\`\`\`\n` +
      `Manual intervention may be required.`
    );
    await db.updateIncident(diagnosis.incidentId, { fixResult: execResult.output });
    return { resolved: false, fixFailed: true };
  }

  await slack.postMessage(warRoom,
    `⏳ Fix executed. Waiting ${config.HEALTH_CHECK_DELAY_MS / 1000}s for stabilization before health check...`
  );

  // Wait for stabilization
  await new Promise(resolve => setTimeout(resolve, config.HEALTH_CHECK_DELAY_MS));

  // Run health check
  console.log('  Running health check...');
  const healthCheck = require('./health_check');
  const healthResult = healthCheck.check(diagnosis);

  await db.recordTimeline(diagnosis.incidentId,
    healthResult.healthy ? 'health_check_pass' : 'health_check_fail',
    `Health check ${healthResult.healthy ? 'passed' : 'failed'}: ${healthResult.details}`,
    { currentValue: healthResult.currentValue }
  );

  if (healthResult.healthy) {
    const mttrSeconds = Math.round((Date.now() - new Date(diagnosis.detectedAt || Date.now()).getTime()) / 1000);

    await slack.postMessage(warRoom,
      `✅ *RESOLVED — ${diagnosis.incidentNumber}*\n\n` +
      `Fix Applied: ${selectedFix.description}\n` +
      `Approved by: <@${approval.approver}>\n` +
      `MTTR: ${Math.round(mttrSeconds / 60)} minutes\n\n` +
      `Health check passed — ${diagnosis.metric} back to ${healthResult.currentValue}.\n` +
      `Postmortem will be generated shortly.`
    );

    await db.updateIncident(diagnosis.incidentId, {
      status: 'resolved',
      fixResult: execResult.output,
      resolvedAt: new Date().toISOString(),
      mttrSeconds
    });

    await db.recordTimeline(diagnosis.incidentId, 'resolved',
      `Incident resolved. MTTR: ${Math.round(mttrSeconds / 60)} minutes`
    );

    return { resolved: true, fixApplied: selectedFix.description, approver: approval.approver, healthCheck: healthResult };
  } else {
    await slack.postMessage(warRoom,
      `⚠️ *Health check FAILED* after fix.\n` +
      `${diagnosis.metric} still at ${healthResult.currentValue} (expected below ${diagnosis.thresholdValue})\n\n` +
      `Manual investigation required.`
    );

    return { resolved: false, healthCheckFailed: true, healthCheck: healthResult };
  }
}

module.exports = { run };
