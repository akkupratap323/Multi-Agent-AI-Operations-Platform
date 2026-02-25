#!/usr/bin/env node

/**
 * Service Catalog
 * - Register services with owners, teams, dependencies
 * - Automatic dependency impact analysis during incidents
 * - Links services to on-call schedules, escalation policies, runbooks
 */

const db = require('./db');

/**
 * Register a service in the catalog
 */
async function registerService(service) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      INSERT INTO service_catalog (
        name, display_name, description, service_type, resource_id,
        owner_slack_id, owner_name, team, tier,
        escalation_policy_id, on_call_schedule_id, runbook_ids,
        slack_channel, repo_url, dashboard_url, tags, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        service_type = EXCLUDED.service_type,
        resource_id = EXCLUDED.resource_id,
        owner_slack_id = EXCLUDED.owner_slack_id,
        owner_name = EXCLUDED.owner_name,
        team = EXCLUDED.team,
        tier = EXCLUDED.tier,
        escalation_policy_id = EXCLUDED.escalation_policy_id,
        on_call_schedule_id = EXCLUDED.on_call_schedule_id,
        runbook_ids = EXCLUDED.runbook_ids,
        slack_channel = EXCLUDED.slack_channel,
        repo_url = EXCLUDED.repo_url,
        dashboard_url = EXCLUDED.dashboard_url,
        tags = EXCLUDED.tags,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `, [
      service.name,
      service.displayName || service.name,
      service.description,
      service.serviceType,
      service.resourceId,
      service.ownerSlackId,
      service.ownerName,
      service.team,
      service.tier || 'tier3',
      service.escalationPolicyId,
      service.onCallScheduleId,
      service.runbookIds || [],
      service.slackChannel,
      service.repoUrl,
      service.dashboardUrl,
      service.tags || [],
      JSON.stringify(service.metadata || {})
    ]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Add a dependency between services
 */
async function addDependency(serviceName, dependsOnName, type = 'runtime', isCritical = false) {
  const client = await db.getClient();
  try {
    const svc = await client.query('SELECT id FROM service_catalog WHERE name = $1', [serviceName]);
    const dep = await client.query('SELECT id FROM service_catalog WHERE name = $1', [dependsOnName]);

    if (svc.rows.length === 0 || dep.rows.length === 0) {
      await client.end();
      return null;
    }

    const result = await client.query(`
      INSERT INTO service_dependencies (service_id, depends_on_id, dependency_type, is_critical)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (service_id, depends_on_id) DO UPDATE SET
        dependency_type = EXCLUDED.dependency_type,
        is_critical = EXCLUDED.is_critical
      RETURNING *
    `, [svc.rows[0].id, dep.rows[0].id, type, isCritical]);
    await client.end();
    return result.rows[0];
  } catch (e) {
    await client.end();
    throw e;
  }
}

/**
 * Get a service by name or resource ID
 */
async function getService(nameOrResourceId) {
  const client = await db.getClient();
  try {
    const result = await client.query(
      'SELECT * FROM service_catalog WHERE name = $1 OR resource_id = $1',
      [nameOrResourceId]
    );
    await client.end();
    return result.rows[0] || null;
  } catch (e) {
    await client.end();
    return null;
  }
}

/**
 * List all services
 */
async function listServices() {
  const client = await db.getClient();
  try {
    const result = await client.query('SELECT * FROM service_catalog ORDER BY tier, name');
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Get all services that depend on a given service (impact analysis)
 */
async function getDependents(serviceName) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT sc.*, sd.dependency_type, sd.is_critical
      FROM service_catalog sc
      JOIN service_dependencies sd ON sd.service_id = sc.id
      JOIN service_catalog dep ON sd.depends_on_id = dep.id
      WHERE dep.name = $1 OR dep.resource_id = $1
      ORDER BY sd.is_critical DESC, sc.tier
    `, [serviceName]);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Get all dependencies of a service
 */
async function getDependencies(serviceName) {
  const client = await db.getClient();
  try {
    const result = await client.query(`
      SELECT sc.*, sd.dependency_type, sd.is_critical
      FROM service_catalog sc
      JOIN service_dependencies sd ON sd.depends_on_id = sc.id
      JOIN service_catalog svc ON sd.service_id = svc.id
      WHERE svc.name = $1 OR svc.resource_id = $1
      ORDER BY sd.is_critical DESC, sc.tier
    `, [serviceName]);
    await client.end();
    return result.rows;
  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Build full dependency graph for impact analysis
 */
async function getImpactGraph(serviceName) {
  const directDependents = await getDependents(serviceName);
  const allImpacted = new Map();

  async function traverse(svcName, depth = 0) {
    if (depth > 5 || allImpacted.has(svcName)) return;
    const deps = await getDependents(svcName);
    for (const dep of deps) {
      allImpacted.set(dep.name, { ...dep, depth });
      await traverse(dep.name, depth + 1);
    }
  }

  await traverse(serviceName);

  return {
    directDependents,
    allImpacted: Array.from(allImpacted.values()),
    criticalPath: Array.from(allImpacted.values()).filter(d => d.is_critical)
  };
}

module.exports = {
  registerService,
  addDependency,
  getService,
  listServices,
  getDependents,
  getDependencies,
  getImpactGraph
};
