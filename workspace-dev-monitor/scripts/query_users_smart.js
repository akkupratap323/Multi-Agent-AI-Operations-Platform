#!/usr/bin/env node

/**
 * Smart User Query - Natural language database queries
 *
 * Understands requests like:
 * - "show me 5 new users"
 * - "get all users from last week"
 * - "who signed up yesterday"
 */

const { Client } = require('pg');

const CONNECTION_STRING = process.env.NEON_DB_URL;

/**
 * Parse natural language query to extract intent
 */
function parseQuery(query) {
  const text = query.toLowerCase();

  // Extract number of users requested
  let limit = 1; // default
  const numberMatch = text.match(/(\d+)\s*(users?|new|recent|latest)/);
  if (numberMatch) {
    limit = parseInt(numberMatch[1]);
  } else if (text.includes('all')) {
    limit = 100; // reasonable max
  } else if (text.includes('new') || text.includes('recent') || text.includes('latest')) {
    limit = 5; // default for "new users"
  }

  // Extract time filter
  let timeFilter = null;
  if (text.includes('today')) {
    timeFilter = 'TODAY';
  } else if (text.includes('yesterday')) {
    timeFilter = 'YESTERDAY';
  } else if (text.includes('last week') || text.includes('this week')) {
    timeFilter = 'WEEK';
  } else if (text.includes('last month') || text.includes('this month')) {
    timeFilter = 'MONTH';
  }

  // Determine sort order
  const sortOrder = text.includes('old') || text.includes('first') ? 'ASC' : 'DESC';

  return { limit, timeFilter, sortOrder };
}

/**
 * Build SQL query based on parsed intent
 */
function buildQuery(params) {
  let query = `
    SELECT "id", "username", "displayName", "email", "createdAt"
    FROM "users"
  `;

  const conditions = [];

  // Add time filter
  if (params.timeFilter === 'TODAY') {
    conditions.push(`"createdAt" >= CURRENT_DATE`);
  } else if (params.timeFilter === 'YESTERDAY') {
    conditions.push(`"createdAt" >= CURRENT_DATE - INTERVAL '1 day' AND "createdAt" < CURRENT_DATE`);
  } else if (params.timeFilter === 'WEEK') {
    conditions.push(`"createdAt" >= CURRENT_DATE - INTERVAL '7 days'`);
  } else if (params.timeFilter === 'MONTH') {
    conditions.push(`"createdAt" >= CURRENT_DATE - INTERVAL '30 days'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY "createdAt" ${params.sortOrder}`;
  query += ` LIMIT ${params.limit}`;

  return query;
}

/**
 * Format user data for display
 */
function formatUsers(users) {
  if (users.length === 0) {
    return 'No users found matching that criteria.';
  }

  let output = `Found ${users.length} user${users.length > 1 ? 's' : ''}:\n\n`;

  users.forEach((user, i) => {
    const joinDate = new Date(user.createdAt);
    const joinedAgo = getTimeAgo(joinDate);

    output += `${i + 1}. *${user.displayName}*\n`;
    output += `   • Username: ${user.username}\n`;
    output += `   • Email: ${user.email || 'N/A'}\n`;
    output += `   • Joined: ${joinDate.toLocaleString()} (${joinedAgo})\n`;
    output += `   • ID: ${user.id}\n\n`;
  });

  return output;
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  return `${Math.floor(seconds / 2592000)} months ago`;
}

/**
 * Main query function
 */
async function queryUsers(naturalLanguageQuery) {
  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Parse the query
    const params = parseQuery(naturalLanguageQuery);
    console.log('Query params:', JSON.stringify(params));

    // Build SQL
    const sqlQuery = buildQuery(params);
    console.log('SQL:', sqlQuery);

    // Execute
    const result = await client.query(sqlQuery);

    // Format output
    const formatted = formatUsers(result.rows);

    await client.end();

    return formatted;
  } catch (error) {
    console.error('Error:', error.message);
    await client.end();
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const query = process.argv.slice(2).join(' ') || 'show me 5 new users';

  console.log(`Query: "${query}"\n`);

  queryUsers(query)
    .then(result => console.log(result))
    .catch(error => console.error('Failed:', error.message));
} else {
  // Export for use by other scripts
  module.exports = { queryUsers };
}
