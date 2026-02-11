#!/usr/bin/env node

/**
 * Stage 2: Diagnose
 * Gathers context (logs, deployments, git commits) and uses LLM to identify root cause
 */

const { execSync } = require('child_process');
const config = require('./config');
const cw = require('./utils/cloudwatch');
const db = require('./utils/db');
const llm = require('./utils/llm');

/**
 * Get recent CloudWatch logs for the affected service
 */
function gatherLogs(anomaly) {
  const fifteenMinAgo = Date.now() - (15 * 60 * 1000);
  let logGroupPrefix = '';

  switch (anomaly.serviceType) {
    case 'ecs':
      logGroupPrefix = `/ecs/${anomaly.resourceId}`;
      break;
    case 'lambda':
      logGroupPrefix = `/aws/lambda/${anomaly.resourceId}`;
      break;
    case 'rds':
      logGroupPrefix = `/aws/rds/instance/${anomaly.resourceId}`;
      break;
    case 'ec2':
      logGroupPrefix = `/ec2/${anomaly.resourceId}`;
      break;
    default:
      return [];
  }

  // Find matching log groups
  const logGroups = cw.findLogGroups(logGroupPrefix);
  if (logGroups.length === 0) {
    // Try broader search
    const broaderGroups = cw.findLogGroups(`/aws/${anomaly.serviceType}`);
    if (broaderGroups.length === 0) return [];
    logGroups.push(...broaderGroups.slice(0, 2));
  }

  const allLogs = [];
  for (const group of logGroups.slice(0, 3)) {
    const logs = cw.getLogEvents(group, fifteenMinAgo, 'ERROR', 20);
    allLogs.push(...logs);

    // Also check for warnings
    const warnings = cw.getLogEvents(group, fifteenMinAgo, 'WARN', 10);
    allLogs.push(...warnings);
  }

  return allLogs.slice(0, 50); // Cap at 50 log entries
}

/**
 * Check recent deployments for the affected service
 */
function gatherDeploymentInfo(anomaly) {
  const lines = [];

  try {
    if (anomaly.serviceType === 'ecs' && anomaly.extra) {
      const data = cw.runAWS(
        `ecs describe-services --cluster "${anomaly.extra.clusterArn}" --services "${anomaly.resourceId}"`
      );
      if (data && data.services && data.services[0]) {
        const svc = data.services[0];
        for (const dep of (svc.deployments || [])) {
          const age = Math.round((Date.now() - new Date(dep.createdAt).getTime()) / (60 * 1000));
          lines.push(`ECS Deployment: ${dep.status} | Task: ${dep.taskDefinition.split('/').pop()} | ${age} min ago | Running: ${dep.runningCount}/${dep.desiredCount}`);
        }
      }
    }

    if (anomaly.serviceType === 'lambda') {
      const data = cw.runAWS(`lambda get-function --function-name "${anomaly.resourceId}"`);
      if (data && data.Configuration) {
        const modified = new Date(data.Configuration.LastModified);
        const age = Math.round((Date.now() - modified.getTime()) / (60 * 1000));
        lines.push(`Lambda last modified: ${age} minutes ago`);
        lines.push(`Runtime: ${data.Configuration.Runtime}, Memory: ${data.Configuration.MemorySize}MB`);
      }
    }
  } catch (error) {
    lines.push(`Could not fetch deployment info: ${error.message}`);
  }

  return lines.join('\n') || 'No deployment info available';
}

/**
 * Get recent git commits from configured repos
 */
function gatherGitCommits() {
  const lines = [];

  for (const repo of config.GITHUB_REPOS) {
    try {
      const output = execSync(
        `gh api repos/${repo}/commits --jq '.[0:5] | .[] | "\\(.sha[0:7]) \\(.commit.message | split("\\n")[0]) (\\(.commit.author.date))"'`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }
      );
      if (output.trim()) {
        lines.push(`--- ${repo} ---`);
        lines.push(output.trim());
      }
    } catch (error) {
      // gh CLI might not have access to this repo
    }
  }

  return lines.join('\n') || 'No recent commits found';
}

/**
 * Run diagnosis for an anomaly
 */
async function run(anomaly) {
  console.log(`\n🔍 [DIAGNOSE] Analyzing ${anomaly.serviceType}/${anomaly.resourceId} (${anomaly.metric})`);

  // Generate incident number
  const incidentNumber = await db.getNextIncidentNumber();

  // Create incident record in DB
  const incidentRecord = await db.createIncident({
    incidentNumber,
    severity: anomaly.severity,
    serviceType: anomaly.serviceType,
    resourceId: anomaly.resourceId,
    metric: anomaly.metric,
    metricValue: anomaly.metricValue,
    thresholdValue: anomaly.thresholdValue,
    rawMetrics: anomaly.rawMetrics
  });

  const incidentId = incidentRecord.id;
  await db.recordTimeline(incidentId, 'detected', `${anomaly.severity} anomaly detected: ${anomaly.metric}=${anomaly.metricValue} (threshold: ${anomaly.thresholdValue})`);

  // Gather context
  console.log('  Gathering logs...');
  const logs = gatherLogs(anomaly);

  console.log('  Checking deployments...');
  const recentDeployments = gatherDeploymentInfo(anomaly);

  console.log('  Checking git commits...');
  const recentCommits = gatherGitCommits();

  // Call LLM for diagnosis
  console.log('  Running LLM diagnosis...');
  await db.updateIncident(incidentId, { status: 'diagnosing' });

  const diagnosis = await llm.diagnoseIncident({
    ...anomaly,
    logs,
    recentDeployments,
    recentCommits
  });

  if (!diagnosis) {
    console.error('  LLM diagnosis failed, using fallback');
    const fallbackDiagnosis = {
      rootCause: `${anomaly.metric} exceeded ${anomaly.severity} threshold on ${anomaly.serviceType}/${anomaly.resourceId}. Manual investigation required.`,
      confidence: 0.3,
      affectedServices: [anomaly.resourceId],
      suggestedFixes: [
        { description: `Restart ${anomaly.serviceType} service`, command: 'Manual action required', risk: 'low' }
      ]
    };

    await db.updateIncident(incidentId, {
      status: 'diagnosed',
      rootCause: fallbackDiagnosis.rootCause,
      confidence: fallbackDiagnosis.confidence,
      suggestedFixes: fallbackDiagnosis.suggestedFixes,
      diagnosedAt: new Date().toISOString()
    });

    await db.recordTimeline(incidentId, 'diagnosed', 'Fallback diagnosis used (LLM unavailable)');

    return {
      incidentId,
      incidentNumber,
      ...anomaly,
      ...fallbackDiagnosis,
      logs
    };
  }

  // Save diagnosis to DB
  await db.updateIncident(incidentId, {
    status: 'diagnosed',
    rootCause: diagnosis.rootCause,
    confidence: diagnosis.confidence,
    affectedServices: diagnosis.affectedServices,
    suggestedFixes: diagnosis.suggestedFixes,
    diagnosedAt: new Date().toISOString(),
    rawLogs: logs.slice(0, 20).map(l => `[${l.timestamp}] ${l.message}`).join('\n')
  });

  await db.recordTimeline(incidentId, 'diagnosed', `Root cause identified (${Math.round(diagnosis.confidence * 100)}% confidence): ${diagnosis.rootCause}`);

  console.log(`  Diagnosis complete: ${diagnosis.rootCause.substring(0, 100)}...`);

  return {
    incidentId,
    incidentNumber,
    ...anomaly,
    ...diagnosis,
    logs
  };
}

module.exports = { run };
