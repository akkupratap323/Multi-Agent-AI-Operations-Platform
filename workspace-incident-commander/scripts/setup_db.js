#!/usr/bin/env node

/**
 * One-time database setup - creates incidents and timeline tables
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

  // Create incidents table
  await client.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id              SERIAL PRIMARY KEY,
      incident_number VARCHAR(30) NOT NULL UNIQUE,
      severity        VARCHAR(2) NOT NULL,
      status          VARCHAR(30) NOT NULL DEFAULT 'detected',
      service_type    VARCHAR(20) NOT NULL,
      resource_id     VARCHAR(200) NOT NULL,
      metric          VARCHAR(100) NOT NULL,
      metric_value    DECIMAL(10,4),
      threshold_value DECIMAL(10,4),
      root_cause      TEXT,
      confidence      DECIMAL(3,2),
      affected_services TEXT[],
      suggested_fixes JSONB,
      approved_fix    INTEGER,
      approver        VARCHAR(100),
      fix_result      TEXT,
      war_room_channel VARCHAR(50),
      detected_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      diagnosed_at    TIMESTAMP WITH TIME ZONE,
      responded_at    TIMESTAMP WITH TIME ZONE,
      approved_at     TIMESTAMP WITH TIME ZONE,
      resolved_at     TIMESTAMP WITH TIME ZONE,
      postmortem_at   TIMESTAMP WITH TIME ZONE,
      mttr_seconds    INTEGER,
      raw_logs        TEXT,
      raw_metrics     JSONB,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created incidents table');

  // Create indexes
  await client.query(`CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_incidents_detected_at ON incidents(detected_at)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service_type, resource_id)`);
  console.log('Created incidents indexes');

  // Create timeline table
  await client.query(`
    CREATE TABLE IF NOT EXISTS incident_timeline (
      id          SERIAL PRIMARY KEY,
      incident_id INTEGER NOT NULL REFERENCES incidents(id),
      event_type  VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      metadata    JSONB,
      created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('Created incident_timeline table');

  await client.query(`CREATE INDEX IF NOT EXISTS idx_timeline_incident ON incident_timeline(incident_id)`);
  console.log('Created timeline indexes');

  await client.end();
  console.log('\nDatabase setup complete!');
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
