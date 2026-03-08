#!/usr/bin/env node

/**
 * Daily Developer Report
 * Generates summary of GitHub activity for standup/EOD reports
 */

const { execSync } = require('child_process');

const REPOS = ['Terrorizer-AI/opentelemetry-js'];
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6'; // all-nester-labs-agents-testing

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    return null;
  }
}

function getRepoActivity(repo) {
  const activity = {
    repo: repo,
    openPRs: 0,
    mergedToday: 0,
    openIssues: 0,
    failedBuilds: 0,
    stalePRs: []
  };

  // Open PRs
  const openPRsData = runCommand(`gh pr list --repo ${repo} --state open --json number,title,author,createdAt,updatedAt --limit 50`);
  if (openPRsData) {
    const prs = JSON.parse(openPRsData);
    activity.openPRs = prs.length;

    // Find stale PRs (>7 days without update)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    activity.stalePRs = prs.filter(pr => new Date(pr.updatedAt) < sevenDaysAgo);
  }

  // Merged PRs (last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const mergedData = runCommand(`gh pr list --repo ${repo} --state merged --json mergedAt --limit 50`);
  if (mergedData) {
    const merged = JSON.parse(mergedData);
    activity.mergedToday = merged.filter(pr => pr.mergedAt > yesterday).length;
  }

  // Open issues
  const issuesData = runCommand(`gh issue list --repo ${repo} --state open --json number`);
  if (issuesData) {
    const issues = JSON.parse(issuesData);
    activity.openIssues = issues.length;
  }

  // Failed CI runs
  const runsData = runCommand(`gh run list --repo ${repo} --limit 20 --json conclusion`);
  if (runsData) {
    const runs = JSON.parse(runsData);
    activity.failedBuilds = runs.filter(r => r.conclusion === 'failure').length;
  }

  return activity;
}

function generateReport() {
  let report = '*📊 Daily Dev Report*\n\n';

  REPOS.forEach(repo => {
    const repoName = repo.split('/')[1];
    const activity = getRepoActivity(repo);

    report += `*${repoName}*\n`;
    report += `• ${activity.openPRs} open PRs`;
    if (activity.stalePRs.length > 0) {
      report += ` (${activity.stalePRs.length} stale >7d)`;
    }
    report += '\n';

    if (activity.mergedToday > 0) {
      report += `• ✅ ${activity.mergedToday} merged today\n`;
    }

    if (activity.openIssues > 0) {
      report += `• ${activity.openIssues} open issues\n`;
    }

    if (activity.failedBuilds > 0) {
      report += `• 🔴 ${activity.failedBuilds} failed builds\n`;
    }

    report += '\n';
  });

  const now = new Date();
  report += `_Generated: ${now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST_`;

  return report;
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
      console.log('✅ Report sent to Slack');
    } else {
      console.log('⚠️  Slack API failed:', data.error);
    }
  } catch (error) {
    console.log('⚠️  Could not send to Slack:', error.message);
  }
}

async function main() {
  console.log('📊 Generating daily dev report...\n');

  const report = generateReport();

  console.log(report);
  console.log('\n' + '─'.repeat(50));

  // Send to Slack
  await sendToSlack(report);

  console.log('\n✨ Report complete!');
}

main();
