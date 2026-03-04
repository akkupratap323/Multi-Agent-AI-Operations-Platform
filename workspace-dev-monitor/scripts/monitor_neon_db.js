#!/usr/bin/env node

/**
 * Neon DB Monitor using Neon API
 * Tracks database metrics, projects, and branches using Neon API key
 */

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

async function fetchNeonAPI(endpoint) {
  try {
    const response = await fetch(`${NEON_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${NEON_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Neon API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error.message);
    return null;
  }
}

async function getProjects() {
  console.log('📊 Fetching Neon DB Projects...\n');

  const data = await fetchNeonAPI('/projects');

  if (!data || !data.projects) {
    console.log('❌ Could not fetch projects');
    return [];
  }

  console.log('🗂️  NEON DB PROJECTS');
  console.log('═'.repeat(60));

  data.projects.forEach(project => {
    console.log(`\nProject: ${project.name || project.id}`);
    console.log(`  ID: ${project.id}`);
    console.log(`  Region: ${project.region_id}`);
    console.log(`  Created: ${new Date(project.created_at).toLocaleDateString()}`);
    console.log(`  Updated: ${new Date(project.updated_at).toLocaleDateString()}`);
    console.log(`  Platform: ${project.platform_id || 'Neon'}`);

    if (project.pg_version) {
      console.log(`  PostgreSQL: v${project.pg_version}`);
    }

    if (project.store_passwords) {
      console.log(`  Password Storage: Enabled`);
    }
  });

  console.log('');
  return data.projects;
}

async function getProjectDetails(projectId) {
  console.log(`\n🔍 Project Details: ${projectId}`);
  console.log('─'.repeat(60));

  const project = await fetchNeonAPI(`/projects/${projectId}`);

  if (!project || !project.project) {
    console.log('❌ Could not fetch project details');
    return null;
  }

  const proj = project.project;

  console.log(`Name: ${proj.name || 'Unnamed'}`);
  console.log(`Region: ${proj.region_id}`);
  console.log(`PostgreSQL Version: ${proj.pg_version}`);
  console.log(`Created: ${new Date(proj.created_at).toLocaleString()}`);
  console.log(`Updated: ${new Date(proj.updated_at).toLocaleString()}`);

  return proj;
}

async function getBranches(projectId) {
  console.log(`\n🌿 Database Branches`);
  console.log('─'.repeat(60));

  const data = await fetchNeonAPI(`/projects/${projectId}/branches`);

  if (!data || !data.branches) {
    console.log('No branches found');
    return [];
  }

  console.log(`Total Branches: ${data.branches.length}\n`);

  data.branches.forEach(branch => {
    const isPrimary = branch.primary ? '⭐ PRIMARY' : '';
    console.log(`Branch: ${branch.name} ${isPrimary}`);
    console.log(`  ID: ${branch.id}`);
    console.log(`  Created: ${new Date(branch.created_at).toLocaleDateString()}`);
    console.log(`  Updated: ${new Date(branch.updated_at).toLocaleDateString()}`);

    if (branch.current_state) {
      console.log(`  State: ${branch.current_state}`);
    }

    if (branch.parent_id) {
      console.log(`  Parent Branch: ${branch.parent_id}`);
    }

    console.log('');
  });

  return data.branches;
}

async function getDatabases(projectId, branchId) {
  console.log(`\n💾 Databases in Branch`);
  console.log('─'.repeat(60));

  const data = await fetchNeonAPI(`/projects/${projectId}/branches/${branchId}/databases`);

  if (!data || !data.databases) {
    console.log('No databases found');
    return [];
  }

  console.log(`Total Databases: ${data.databases.length}\n`);

  data.databases.forEach(db => {
    console.log(`Database: ${db.name}`);
    console.log(`  ID: ${db.id}`);
    console.log(`  Owner: ${db.owner_name}`);
    console.log(`  Created: ${new Date(db.created_at).toLocaleDateString()}`);
    console.log('');
  });

  return data.databases;
}

async function getEndpoints(projectId) {
  console.log(`\n🔌 Database Endpoints`);
  console.log('─'.repeat(60));

  const data = await fetchNeonAPI(`/projects/${projectId}/endpoints`);

  if (!data || !data.endpoints) {
    console.log('No endpoints found');
    return [];
  }

  console.log(`Total Endpoints: ${data.endpoints.length}\n`);

  data.endpoints.forEach(endpoint => {
    console.log(`Endpoint: ${endpoint.id}`);
    console.log(`  Host: ${endpoint.host}`);
    console.log(`  Type: ${endpoint.type || 'read_write'}`);
    console.log(`  Branch: ${endpoint.branch_id}`);
    console.log(`  Region: ${endpoint.region_id}`);

    if (endpoint.current_state) {
      console.log(`  State: ${endpoint.current_state}`);
    }

    if (endpoint.pooler_enabled) {
      console.log(`  Connection Pooling: ✅ Enabled`);
    }

    if (endpoint.autoscaling_limit_min_cu && endpoint.autoscaling_limit_max_cu) {
      console.log(`  Autoscaling: ${endpoint.autoscaling_limit_min_cu} - ${endpoint.autoscaling_limit_max_cu} CU`);
    }

    console.log('');
  });

  return data.endpoints;
}

async function getConsumption(projectId) {
  console.log(`\n📈 Usage & Consumption`);
  console.log('─'.repeat(60));

  // Get current period consumption
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = startOfMonth.toISOString();
  const to = now.toISOString();

  const data = await fetchNeonAPI(`/projects/${projectId}/consumption?from=${from}&to=${to}&granularity=monthly`);

  if (!data) {
    console.log('Unable to fetch consumption data');
    return null;
  }

  console.log(`Period: ${startOfMonth.toLocaleDateString()} - ${now.toLocaleDateString()}\n`);

  if (data.periods && data.periods.length > 0) {
    const period = data.periods[0];

    if (period.data_storage_bytes_hour) {
      const storageGB = (period.data_storage_bytes_hour / (1024 ** 3)).toFixed(2);
      console.log(`Storage Usage: ${storageGB} GB-hours`);
    }

    if (period.compute_time_seconds) {
      const computeHours = (period.compute_time_seconds / 3600).toFixed(2);
      console.log(`Compute Time: ${computeHours} hours`);
    }

    if (period.written_data_bytes) {
      const writtenMB = (period.written_data_bytes / (1024 ** 2)).toFixed(2);
      console.log(`Data Written: ${writtenMB} MB`);
    }

    if (period.synthetic_storage_size) {
      const syntheticGB = (period.synthetic_storage_size / (1024 ** 3)).toFixed(2);
      console.log(`Synthetic Storage: ${syntheticGB} GB`);
    }
  } else {
    console.log('No consumption data available for this period');
  }

  console.log('');
  return data;
}

async function getOperations(projectId) {
  console.log(`\n⚡ Recent Operations`);
  console.log('─'.repeat(60));

  const data = await fetchNeonAPI(`/projects/${projectId}/operations`);

  if (!data || !data.operations || data.operations.length === 0) {
    console.log('No recent operations');
    return [];
  }

  console.log(`Recent Operations (Last ${Math.min(data.operations.length, 10)}):\n`);

  data.operations.slice(0, 10).forEach(op => {
    const created = new Date(op.created_at);
    const updated = new Date(op.updated_at);
    const duration = ((updated - created) / 1000).toFixed(2);

    console.log(`${op.action} (${op.status})`);
    console.log(`  ID: ${op.id}`);
    console.log(`  Started: ${created.toLocaleString()}`);
    console.log(`  Duration: ${duration}s`);
    console.log('');
  });

  return data.operations;
}

async function sendToSlack(message) {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        text: message
      })
    });

    const data = await response.json();
    if (data.ok) {
      console.log('\n✅ Report sent to Slack');
    } else {
      console.log('\n⚠️  Slack send failed:', data.error);
    }
  } catch (error) {
    console.log('\n⚠️  Could not send to Slack:', error.message);
  }
}

function formatSlackReport(summary) {
  let message = '*📊 Neon DB Monitoring Report*\n\n';

  if (summary.projects && summary.projects.length > 0) {
    message += `*Projects: ${summary.projects.length}*\n`;

    summary.projects.forEach(proj => {
      message += `\n*${proj.name || proj.id}*\n`;
      message += `• Region: ${proj.region_id}\n`;
      message += `• PostgreSQL: v${proj.pg_version}\n`;
      message += `• Branches: ${proj.branchCount || 0}\n`;
      message += `• Databases: ${proj.databaseCount || 0}\n`;
      message += `• Endpoints: ${proj.endpointCount || 0}\n`;
    });
  }

  if (summary.recentOps && summary.recentOps.length > 0) {
    message += `\n*⚡ Recent Activity:*\n`;
    message += `${summary.recentOps.length} operations in last period\n`;
  }

  message += `\n_Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST_`;

  return message;
}

async function main() {
  console.log('\n🚀 Neon DB Monitor');
  console.log('═'.repeat(60));
  console.log('Analyzing your Neon databases...\n');

  const summary = {
    projects: [],
    recentOps: []
  };

  // Get all projects
  const projects = await getProjects();

  if (projects.length === 0) {
    console.log('❌ No projects found or API error');
    return;
  }

  // Analyze each project
  for (const project of projects) {
    const projectId = project.id;

    await getProjectDetails(projectId);

    const branches = await getBranches(projectId);
    project.branchCount = branches.length;

    // Get databases from primary branch
    const primaryBranch = branches.find(b => b.primary);
    if (primaryBranch) {
      const databases = await getDatabases(projectId, primaryBranch.id);
      project.databaseCount = databases.length;
    }

    const endpoints = await getEndpoints(projectId);
    project.endpointCount = endpoints.length;

    await getConsumption(projectId);

    const operations = await getOperations(projectId);
    summary.recentOps = operations;

    summary.projects.push(project);

    console.log('\n' + '═'.repeat(60));
  }

  // Send summary to Slack
  const slackMessage = formatSlackReport(summary);
  console.log('\n📱 Slack Report:');
  console.log('─'.repeat(60));
  console.log(slackMessage);
  console.log('─'.repeat(60));

  await sendToSlack(slackMessage);

  console.log('\n✨ Neon DB monitoring complete!');
}

main().catch(console.error);
