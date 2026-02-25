#!/usr/bin/env node

/**
 * Database Schema V2 - Adds tables for all new features:
 * - on_call_schedules, on_call_overrides, escalation_policies
 * - runbooks, runbook_executions
 * - service_catalog, service_dependencies
 * - slo_definitions, slo_measurements
 * - maintenance_windows
 * - incident_similarity cache
 * - status_page_config, status_page_updates
 * - analytics tables / views
 */

const { Client } = require('/Users/apple/.openclaw/node_modules/pg');
const config = require('./config');

async function setup() {
  const client = new Client({
    connectionString: config.NEON_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to Neon DB');

  // ============================================================
  // 1. ON-CALL SCHEDULES & ESCALATION
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS on_call_schedules (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(100) NOT NULL,
      timezone        VARCHAR(50) DEFAULT 'Asia/Kolkata',
      rotation_type   VARCHAR(20) DEFAULT 'weekly',
      handoff_time    TIME DEFAULT '09:00',
      handoff_day     INTEGER DEFAULT 1,
      members         JSONB NOT NULL DEFAULT '[]',
      current_index   INTEGER DEFAULT 0,
      slack_group_id  VARCHAR(50),
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created on_call_schedules table');

  await client.query(`
    CREATE TABLE IF NOT EXISTS on_call_overrides (
      id              SERIAL PRIMARY KEY,
      schedule_id     INTEGER REFERENCES on_call_schedules(id),
      user_id         VARCHAR(100) NOT NULL,
      user_name       VARCHAR(100),
      start_time      TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time        TIMESTAMP WITH TIME ZONE NOT NULL,
      reason          TEXT,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created on_call_overrides table');

  await client.query(`
    CREATE TABLE IF NOT EXISTS escalation_policies (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(100) NOT NULL,
      description     TEXT,
      rules           JSONB NOT NULL DEFAULT '[]',
      repeat_count    INTEGER DEFAULT 3,
      repeat_interval INTEGER DEFAULT 5,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created escalation_policies table');

  // ============================================================
  // 2. SERVICE CATALOG
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS service_catalog (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(100) NOT NULL UNIQUE,
      display_name    VARCHAR(200),
      description     TEXT,
      service_type    VARCHAR(30),
      resource_id     VARCHAR(200),
      owner_slack_id  VARCHAR(50),
      owner_name      VARCHAR(100),
      team            VARCHAR(100),
      tier            VARCHAR(10) DEFAULT 'tier3',
      escalation_policy_id INTEGER REFERENCES escalation_policies(id),
      on_call_schedule_id  INTEGER REFERENCES on_call_schedules(id),
      runbook_ids     INTEGER[],
      slack_channel   VARCHAR(50),
      repo_url        VARCHAR(500),
      dashboard_url   VARCHAR(500),
      tags            TEXT[],
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created service_catalog table');

  await client.query(`
    CREATE TABLE IF NOT EXISTS service_dependencies (
      id              SERIAL PRIMARY KEY,
      service_id      INTEGER REFERENCES service_catalog(id),
      depends_on_id   INTEGER REFERENCES service_catalog(id),
      dependency_type VARCHAR(30) DEFAULT 'runtime',
      is_critical     BOOLEAN DEFAULT false,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(service_id, depends_on_id)
    )
  `);
  console.log('Created service_dependencies table');

  // ============================================================
  // 3. RUNBOOKS
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS runbooks (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(200) NOT NULL,
      description     TEXT,
      service_name    VARCHAR(100),
      trigger_metric  VARCHAR(100),
      trigger_severity VARCHAR(5),
      auto_execute    BOOLEAN DEFAULT false,
      steps           JSONB NOT NULL DEFAULT '[]',
      tags            TEXT[],
      last_executed   TIMESTAMP WITH TIME ZONE,
      execution_count INTEGER DEFAULT 0,
      success_rate    DECIMAL(5,2) DEFAULT 0,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created runbooks table');

  await client.query(`
    CREATE TABLE IF NOT EXISTS runbook_executions (
      id              SERIAL PRIMARY KEY,
      runbook_id      INTEGER REFERENCES runbooks(id),
      incident_id     INTEGER REFERENCES incidents(id),
      triggered_by    VARCHAR(50) DEFAULT 'manual',
      status          VARCHAR(20) DEFAULT 'running',
      steps_completed INTEGER DEFAULT 0,
      total_steps     INTEGER DEFAULT 0,
      output          JSONB DEFAULT '[]',
      started_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at    TIMESTAMP WITH TIME ZONE,
      duration_ms     INTEGER
    )
  `);
  console.log('Created runbook_executions table');

  // ============================================================
  // 4. SLO TRACKING
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS slo_definitions (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(200) NOT NULL,
      service_name    VARCHAR(100),
      metric_type     VARCHAR(50) NOT NULL,
      target_value    DECIMAL(10,4) NOT NULL,
      window_type     VARCHAR(20) DEFAULT 'rolling',
      window_days     INTEGER DEFAULT 30,
      error_budget    DECIMAL(10,4),
      alert_burn_rate DECIMAL(5,2) DEFAULT 1.0,
      description     TEXT,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created slo_definitions table');

  await client.query(`
    CREATE TABLE IF NOT EXISTS slo_measurements (
      id              SERIAL PRIMARY KEY,
      slo_id          INTEGER REFERENCES slo_definitions(id),
      measured_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      total_events    BIGINT DEFAULT 0,
      good_events     BIGINT DEFAULT 0,
      current_value   DECIMAL(10,6),
      error_budget_remaining DECIMAL(10,6),
      burn_rate       DECIMAL(10,4),
      metadata        JSONB DEFAULT '{}'
    )
  `);
  console.log('Created slo_measurements table');

  // ============================================================
  // 5. MAINTENANCE WINDOWS
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS maintenance_windows (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(200) NOT NULL,
      description     TEXT,
      service_names   TEXT[],
      resource_ids    TEXT[],
      start_time      TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time        TIMESTAMP WITH TIME ZONE NOT NULL,
      recurring       BOOLEAN DEFAULT false,
      recurrence_rule VARCHAR(100),
      suppress_alerts BOOLEAN DEFAULT true,
      created_by      VARCHAR(100),
      status          VARCHAR(20) DEFAULT 'scheduled',
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created maintenance_windows table');

  // ============================================================
  // 6. STATUS PAGE
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS status_page_components (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(200) NOT NULL,
      description     TEXT,
      service_name    VARCHAR(100),
      display_order   INTEGER DEFAULT 0,
      current_status  VARCHAR(30) DEFAULT 'operational',
      last_updated    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created status_page_components table');

  await client.query(`
    CREATE TABLE IF NOT EXISTS status_page_updates (
      id              SERIAL PRIMARY KEY,
      incident_id     INTEGER REFERENCES incidents(id),
      component_id    INTEGER REFERENCES status_page_components(id),
      status          VARCHAR(30) NOT NULL,
      message         TEXT NOT NULL,
      is_public       BOOLEAN DEFAULT true,
      posted_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created status_page_updates table');

  // ============================================================
  // 7. ALERT DEDUPLICATION
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS alert_groups (
      id              SERIAL PRIMARY KEY,
      fingerprint     VARCHAR(200) NOT NULL UNIQUE,
      service_type    VARCHAR(30),
      resource_id     VARCHAR(200),
      metric          VARCHAR(100),
      first_seen      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_seen       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      count           INTEGER DEFAULT 1,
      status          VARCHAR(20) DEFAULT 'active',
      incident_id     INTEGER REFERENCES incidents(id),
      suppressed      BOOLEAN DEFAULT false
    )
  `);
  console.log('Created alert_groups table');

  // ============================================================
  // 8. INCIDENT SIMILARITY CACHE
  // ============================================================
  await client.query(`
    ALTER TABLE incidents
    ADD COLUMN IF NOT EXISTS embedding_vector TEXT,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS auto_remediated BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS on_call_user VARCHAR(100),
    ADD COLUMN IF NOT EXISTS runbook_id INTEGER,
    ADD COLUMN IF NOT EXISTS maintenance_window_id INTEGER,
    ADD COLUMN IF NOT EXISTS slo_impact JSONB
  `);
  console.log('Updated incidents table with new columns');

  // ============================================================
  // Create indexes for new tables
  // ============================================================
  await client.query(`CREATE INDEX IF NOT EXISTS idx_oncall_schedule ON on_call_schedules(name)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_oncall_overrides_time ON on_call_overrides(start_time, end_time)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_service_catalog_name ON service_catalog(name)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_service_catalog_type ON service_catalog(service_type, resource_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_runbooks_service ON runbooks(service_name)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_runbooks_trigger ON runbooks(trigger_metric, trigger_severity)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_slo_service ON slo_definitions(service_name)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_slo_measurements_time ON slo_measurements(measured_at)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_maintenance_time ON maintenance_windows(start_time, end_time)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_alert_groups_fp ON alert_groups(fingerprint)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_status_components ON status_page_components(service_name)`);
  console.log('Created all indexes');

  await client.end();
  console.log('\nDatabase V2 setup complete!');
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
