#!/usr/bin/env node

/**
 * Runbook Engine
 * - Pre-defined automated playbooks per service/metric
 * - Step-by-step execution with rollback support
 * - Auto-execute for P3 issues (when enabled)
 * - Execution history and success rate tracking
 */

const { execSync } = require('child_process');
const config = require('../config');
const db = require('./db');
const slack = require('./slack');

// ============================================================
// RUNBOOK MANAGEMENT
// ============================================================

/**
 * Create a new runbook
 * steps: [{ name, command, timeout_ms, rollback_command, continue_on_failure }]
 */
async function createRunbook(runbook) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      INSERT INTO runbooks (name, description, service_name, trigger_metric, trigger_severity, auto_execute, steps, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      runbook.name,
      runbook.description,
      runbook.serviceName,
      runbook.triggerMetric,
      runbook.triggerSeverity,
      runbook.autoExecute || false,
      JSON.stringify(runbook.steps),
      runbook.tags || []
    ]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Find matching runbooks for an anomaly
 */
async function findRunbooks(anomaly) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT * FROM runbooks
      WHERE (service_name = $1 OR service_name IS NULL)
      AND (trigger_metric = $2 OR trigger_metric IS NULL)
      AND (trigger_severity = $3 OR trigger_severity IS NULL OR trigger_severity >= $3)
      ORDER BY
        CASE WHEN service_name = $1 AND trigger_metric = $2 THEN 0
             WHEN service_name = $1 THEN 1
             WHEN trigger_metric = $2 THEN 2
             ELSE 3 END,
        execution_count DESC
    `, [anomaly.resourceId, anomaly.metric, anomaly.severity]);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Execute a runbook step by step
 */
async function executeRunbook(runbookId, incidentId, triggeredBy = 'auto') {
  const client = await db.getClient();
  let runbook, execution;

  try {
    const rbResult = await client.query('SELECT * FROM runbooks WHERE id = $1', [runbookId]);
    if (rbResult.rows.length === 0) { await client.end(); return null; }
    runbook = rbResult.rows[0];

    // Create execution record
    const execResult = await client.query(`
      INSERT INTO runbook_executions (runbook_id, incident_id, triggered_by, total_steps)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [runbookId, incidentId, triggeredBy, runbook.steps.length]);
    execution = execResult.rows[0];
    await client.end();
  } catch (e) {
    await client.end();
    throw e;
  }

  const steps = runbook.steps;
  const outputs = [];
  let success = true;

  console.log(`  Running runbook: ${runbook.name} (${steps.length} steps)`);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`    Step ${i + 1}/${steps.length}: ${step.name}`);

    const stepResult = { step: i + 1, name: step.name, status: 'running' };

    try {
      // Safety check on command
      if (!isCommandSafe(step.command)) {
        stepResult.status = 'blocked';
        stepResult.output = 'Command blocked by safety filter';
        outputs.push(stepResult);
        if (!step.continue_on_failure) { success = false; break; }
        continue;
      }

      const output = execSync(step.command, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: step.timeout_ms || 30000,
        env: { ...process.env, AWS_DEFAULT_REGION: config.AWS_REGION }
      });

      stepResult.status = 'completed';
      stepResult.output = output.substring(0, 2000);
      outputs.push(stepResult);

      // Update execution progress
      const c = await db.getClient();
      await c.query('UPDATE runbook_executions SET steps_completed = $1 WHERE id = $2', [i + 1, execution.id]);
      await c.end();

    } catch (error) {
      stepResult.status = 'failed';
      stepResult.output = error.message.substring(0, 500);
      outputs.push(stepResult);

      // Try rollback if available
      if (step.rollback_command) {
        try {
          execSync(step.rollback_command, { encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
          stepResult.rollback = 'success';
        } catch (rbErr) {
          stepResult.rollback = 'failed: ' + rbErr.message.substring(0, 200);
        }
      }

      if (!step.continue_on_failure) {
        success = false;
        break;
      }
    }
  }

  // Update execution record
  const c2 = await db.getClient();
  try {
    const duration = Date.now() - new Date(execution.started_at).getTime();
    await c2.query(`
      UPDATE runbook_executions
      SET status = $1, output = $2, completed_at = NOW(), duration_ms = $3, steps_completed = $4
      WHERE id = $5
    `, [success ? 'completed' : 'failed', JSON.stringify(outputs), duration, outputs.filter(o => o.status === 'completed').length, execution.id]);

    // Update runbook stats
    await c2.query(`
      UPDATE runbooks
      SET execution_count = execution_count + 1,
          last_executed = NOW(),
          success_rate = (
            SELECT COALESCE(
              ROUND(COUNT(*) FILTER (WHERE status = 'completed')::decimal / NULLIF(COUNT(*), 0) * 100, 2),
              0
            )
            FROM runbook_executions WHERE runbook_id = $1
          )
      WHERE id = $1
    `, [runbookId]);
    await c2.end();
  } catch (e) {
    await c2.end();
  }

  return { success, outputs, runbookName: runbook.name, executionId: execution.id };
}

/**
 * Safety filter for runbook commands
 */
function isCommandSafe(command) {
  if (!command) return false;

  const blockedPatterns = [
    /rm\s+-rf/i,
    /rm\s+--recursive.*--force/i,
    /mkfs/i,
    /dd\s+if=/i,
    /:(){ :|:& };:/,
    /shutdown/i,
    /reboot(?!\s*-)/i,
    /terminate-instances/i,
    /delete-instance(?!-snapshot)/i,
    /delete-db-instance/i,
    /delete-stack/i,
    /delete-bucket/i
  ];

  return !blockedPatterns.some(pattern => pattern.test(command));
}

/**
 * List all runbooks
 */
async function listRunbooks(serviceName = null) {
  const client = await db.getClient();
  try {
    let query = 'SELECT * FROM runbooks';
    const params = [];
    if (serviceName) {
      query += ' WHERE service_name = $1';
      params.push(serviceName);
    }
    query += ' ORDER BY name';
    const result = await client.query(query, params);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Get runbook execution history
 */
async function getExecutionHistory(runbookId, limit = 10) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT re.*, r.name as runbook_name, i.incident_number
      FROM runbook_executions re
      JOIN runbooks r ON re.runbook_id = r.id
      LEFT JOIN incidents i ON re.incident_id = i.id
      WHERE re.runbook_id = $1
      ORDER BY re.started_at DESC
      LIMIT $2
    `, [runbookId, limit]);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

module.exports = {
  createRunbook,
  findRunbooks,
  executeRunbook,
  isCommandSafe,
  listRunbooks,
  getExecutionHistory
};
