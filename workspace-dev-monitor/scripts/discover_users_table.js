#!/usr/bin/env node

/**
 * Discover Users Table Structure
 */

const { Client } = require('pg');

const CONNECTION_STRING = process.env.NEON_DB_URL;

async function main() {
  console.log('🔍 Discovering Users Table Structure\n');

  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('✅ Connected to Ultron database\n');

  // Get column structure
  const structure = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND table_schema = 'public'
    ORDER BY ordinal_position
  `);

  console.log('📋 Users Table Columns:');
  console.log('─'.repeat(60));
  structure.rows.forEach((col, i) => {
    console.log(`${i + 1}. ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? '- Required' : ''}`);
  });

  // Get total user count
  const totalResult = await client.query('SELECT COUNT(*) as count FROM "users"');
  console.log(`\n📊 Total Users: ${totalResult.rows[0].count}`);

  // Get most recent user
  const recentResult = await client.query(`
    SELECT *
    FROM "users"
    ORDER BY "createdAt" DESC
    LIMIT 1
  `);

  if (recentResult.rows.length > 0) {
    console.log(`\n👤 Most Recent User:`);
    const user = recentResult.rows[0];
    Object.entries(user).forEach(([key, value]) => {
      if (value !== null) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value).substring(0, 50) : String(value).substring(0, 50);
        console.log(`   ${key}: ${displayValue}`);
      }
    });
  }

  await client.end();
  console.log('\n✨ Discovery complete!');
}

main().catch(console.error);
