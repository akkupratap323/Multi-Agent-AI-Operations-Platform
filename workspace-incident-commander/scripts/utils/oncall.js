#!/usr/bin/env node

/**
 * On-Call Schedule & Escalation Engine
 * - Rotation management (daily/weekly/custom)
 * - Override support (swap shifts)
 * - Escalation policies with timeout-based level bumps
 * - Slack notifications to on-call responders
 */

const config = require('../config');
const db = require('./db');
const slack = require('./slack');

// ============================================================
// ON-CALL SCHEDULE MANAGEMENT
// ============================================================

/**
 * Create a new on-call schedule
 */
async function createSchedule(schedule) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      INSERT INTO on_call_schedules (name, timezone, rotation_type, handoff_time, handoff_day, members, slack_group_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      schedule.name,
      schedule.timezone || config.TIMEZONE,
      schedule.rotationType || 'weekly',
      schedule.handoffTime || '09:00',
      schedule.handoffDay || 1,
      JSON.stringify(schedule.members || []),
      schedule.slackGroupId || null
    ]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Get the current on-call person for a schedule
 * Checks overrides first, then falls back to rotation
 */
async function getCurrentOnCall(scheduleId) {
  const client = await db.getClient();
  try {
    // Check for active override first
    const override = await client.query(`
      SELECT * FROM on_call_overrides
      WHERE schedule_id = $1 AND start_time <= NOW() AND end_time >= NOW()
      ORDER BY created_at DESC LIMIT 1
    `, [scheduleId]);

    if (override.rows.length > 0) {
      await client.end();
      return {
        userId: override.rows[0].user_id,
        userName: override.rows[0].user_name,
        isOverride: true,
        reason: override.rows[0].reason
      };
    }

    // Get schedule and calculate current rotation
    const schedule = await client.query('SELECT * FROM on_call_schedules WHERE id = $1', [scheduleId]);
    if (schedule.rows.length === 0) {
      await client.end();
      return null;
    }

    const sched = schedule.rows[0];
    const members = sched.members;
    if (!members || members.length === 0) {
      await client.end();
      return null;
    }

    // Calculate rotation index based on time
    const now = new Date();
    const created = new Date(sched.created_at);
    let index;

    if (sched.rotation_type === 'daily') {
      const daysSinceCreation = Math.floor((now - created) / (24 * 60 * 60 * 1000));
      index = daysSinceCreation % members.length;
    } else if (sched.rotation_type === 'weekly') {
      const weeksSinceCreation = Math.floor((now - created) / (7 * 24 * 60 * 60 * 1000));
      index = weeksSinceCreation % members.length;
    } else {
      index = sched.current_index % members.length;
    }

    const current = members[index];
    await client.end();

    return {
      userId: current.slackId,
      userName: current.name,
      email: current.email,
      phone: current.phone,
      isOverride: false,
      scheduleIndex: index
    };
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Create an on-call override (swap shift)
 */
async function createOverride(scheduleId, override) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      INSERT INTO on_call_overrides (schedule_id, user_id, user_name, start_time, end_time, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [scheduleId, override.userId, override.userName, override.startTime, override.endTime, override.reason]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * List all schedules
 */
async function listSchedules() {
  const client = await db.getClient();
  try {
    const result = await client.query('SELECT * FROM on_call_schedules ORDER BY name');
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Get on-call for a specific service (via service catalog)
 */
async function getOnCallForService(serviceName) {
  const client = await db.getClient();
  try {
    const result = await client.query(
      'SELECT on_call_schedule_id FROM service_catalog WHERE name = $1', [serviceName]
    );
    await client.end();

    if (result.rows.length === 0 || !result.rows[0].on_call_schedule_id) {
      // Fall back to default schedule
      return getDefaultOnCall();
    }

    return getCurrentOnCall(result.rows[0].on_call_schedule_id);
  } catch (e) {
    await client.end();
    return getDefaultOnCall();
  }
}

/**
 * Get default on-call (first schedule or config fallback)
 */
async function getDefaultOnCall() {
  const client = await db.getClient();
  try {
    const result = await client.query('SELECT id FROM on_call_schedules ORDER BY id LIMIT 1');
    await client.end();

    if (result.rows.length > 0) {
      return getCurrentOnCall(result.rows[0].id);
    }

    // Fallback to config
    return {
      userId: config.ON_CALL_SLACK_USER,
      userName: 'Default On-Call',
      isOverride: false
    };
  } catch (e) {
    await client.end();
    return { userId: config.ON_CALL_SLACK_USER, userName: 'Default On-Call', isOverride: false };
  }
}

// ============================================================
// ESCALATION ENGINE
// ============================================================

/**
 * Create an escalation policy
 * rules: [{ level: 1, targets: [{type:'schedule'|'user', id:'...'}], timeoutMinutes: 5 }]
 */
async function createEscalationPolicy(policy) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      INSERT INTO escalation_policies (name, description, rules, repeat_count, repeat_interval)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [policy.name, policy.description, JSON.stringify(policy.rules), policy.repeatCount || 3, policy.repeatInterval || 5]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Run escalation for an incident
 * Called when current on-call doesn't acknowledge within timeout
 */
async function escalate(incidentId, currentLevel = 0) {
  const client = await db.getClient();
  try {
    // Get incident and its service's escalation policy
    const incident = await client.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
    if (incident.rows.length === 0) { await client.end(); return; }

    const inc = incident.rows[0];

    // Find escalation policy via service catalog
    const service = await client.query(
      'SELECT escalation_policy_id FROM service_catalog WHERE name = $1 OR resource_id = $2',
      [inc.resource_id, inc.resource_id]
    );

    let policyId;
    if (service.rows.length > 0 && service.rows[0].escalation_policy_id) {
      policyId = service.rows[0].escalation_policy_id;
    } else {
      // Get default escalation policy
      const defaultPolicy = await client.query('SELECT id FROM escalation_policies ORDER BY id LIMIT 1');
      if (defaultPolicy.rows.length === 0) { await client.end(); return; }
      policyId = defaultPolicy.rows[0].id;
    }

    const policy = await client.query('SELECT * FROM escalation_policies WHERE id = $1', [policyId]);
    if (policy.rows.length === 0) { await client.end(); return; }

    const rules = policy.rows[0].rules;
    const nextLevel = currentLevel + 1;

    if (nextLevel > rules.length) {
      // Reached max escalation - broadcast
      await slack.postMessage(await slack.getIncidentsChannel(),
        `:rotating_light: *ESCALATION EXHAUSTED* for ${inc.incident_number}\n` +
        `All escalation levels tried. Incident requires immediate attention!`
      );
      await client.end();
      return;
    }

    const rule = rules[nextLevel - 1];

    // Notify targets at this level
    for (const target of (rule.targets || [])) {
      if (target.type === 'user') {
        await slack.postMessage(inc.war_room_channel || await slack.getIncidentsChannel(),
          `:rotating_light: *ESCALATION L${nextLevel}* — <@${target.id}> you are being paged for ${inc.incident_number}\n` +
          `${inc.severity} | ${inc.service_type}/${inc.resource_id} | ${inc.metric}=${inc.metric_value}`
        );
      } else if (target.type === 'schedule') {
        const onCall = await getCurrentOnCall(parseInt(target.id));
        if (onCall && onCall.userId) {
          await slack.postMessage(inc.war_room_channel || await slack.getIncidentsChannel(),
            `:rotating_light: *ESCALATION L${nextLevel}* — <@${onCall.userId}> (on-call) you are being paged for ${inc.incident_number}\n` +
            `${inc.severity} | ${inc.service_type}/${inc.resource_id} | ${inc.metric}=${inc.metric_value}`
          );
        }
      }
    }

    // Update incident escalation level
    await client.query(
      'UPDATE incidents SET escalation_level = $1, updated_at = NOW() WHERE id = $2',
      [nextLevel, incidentId]
    );

    await client.end();

    await db.recordTimeline(incidentId, 'escalated',
      `Escalated to level ${nextLevel} (policy: ${policy.rows[0].name})`
    );

    return { level: nextLevel, rule };
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Check for unacknowledged incidents and escalate them
 */
async function checkEscalations() {
  const client = await db.getClient();
  try {
    // Find incidents awaiting approval for more than 5 minutes with no escalation
    const incidents = await client.query(`
      SELECT * FROM incidents
      WHERE status IN ('responding', 'awaiting_approval')
      AND escalation_level < 3
      AND responded_at < NOW() - INTERVAL '5 minutes'
      AND approved_at IS NULL
    `);

    await client.end();

    for (const inc of incidents.rows) {
      console.log(`  Escalating ${inc.incident_number} from level ${inc.escalation_level}`);
      await escalate(inc.id, inc.escalation_level);
    }

    return incidents.rows.length;
  } catch (e) {
    await client.end();
    return 0;
  }
}

module.exports = {
  createSchedule,
  getCurrentOnCall,
  createOverride,
  listSchedules,
  getOnCallForService,
  getDefaultOnCall,
  createEscalationPolicy,
  escalate,
  checkEscalations
};
