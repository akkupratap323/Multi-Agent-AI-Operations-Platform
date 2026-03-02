#!/usr/bin/env node

/**
 * GitHub Activity Monitor
 * Checks PRs, issues, CI/CD status across repos
 */

const { execSync } = require('child_process');

// Repos to monitor - add more as needed
const REPOS = [
  'Terrorizer-AI/opentelemetry-js'
];

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    console.error(`Command failed: ${cmd}`);
    return null;
  }
}

function getPRs(repo) {
  console.log(`\n📂 ${repo}`);
  console.log('─'.repeat(50));

  // Open PRs
  const openPRs = runCommand(`gh pr list --repo ${repo} --state open --json number,title,author,createdAt,updatedAt,reviewDecision --limit 20`);

  if (openPRs) {
    const prs = JSON.parse(openPRs);

    if (prs.length === 0) {
      console.log('✅ No open PRs');
    } else {
      console.log(`\n🔄 Open PRs (${prs.length}):`);

      prs.forEach(pr => {
        const author = pr.author?.login || 'Unknown';
        const created = new Date(pr.createdAt);
        const updated = new Date(pr.updatedAt);
        const ageInDays = Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));

        let status = '🟡 Pending Review';
        if (pr.reviewDecision === 'APPROVED') status = '✅ Approved';
        if (pr.reviewDecision === 'CHANGES_REQUESTED') status = '🔴 Changes Requested';

        console.log(`  #${pr.number} - ${pr.title}`);
        console.log(`     by @${author} | ${ageInDays}d old | ${status}`);
      });
    }
  }

  // Recently merged PRs (last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const mergedPRs = runCommand(`gh pr list --repo ${repo} --state merged --json number,title,author,mergedAt --limit 50`);

  if (mergedPRs) {
    const prs = JSON.parse(mergedPRs);
    const recentMerged = prs.filter(pr => pr.mergedAt > yesterday);

    if (recentMerged.length > 0) {
      console.log(`\n✅ Merged in last 24h (${recentMerged.length}):`);
      recentMerged.forEach(pr => {
        const author = pr.author?.login || 'Unknown';
        console.log(`  #${pr.number} - ${pr.title}`);
        console.log(`     by @${author}`);
      });
    }
  }
}

function getIssues(repo) {
  const issues = runCommand(`gh issue list --repo ${repo} --state open --json number,title,labels,assignees --limit 20`);

  if (issues) {
    const issueList = JSON.parse(issues);

    if (issueList.length > 0) {
      console.log(`\n🐛 Open Issues (${issueList.length}):`);

      issueList.slice(0, 5).forEach(issue => {
        const labels = issue.labels?.map(l => l.name).join(', ') || 'none';
        const assignees = issue.assignees?.map(a => a.login).join(', ') || 'unassigned';

        console.log(`  #${issue.number} - ${issue.title}`);
        console.log(`     Labels: ${labels} | Assigned: ${assignees}`);
      });

      if (issueList.length > 5) {
        console.log(`  ... and ${issueList.length - 5} more`);
      }
    } else {
      console.log('\n✅ No open issues');
    }
  }
}

function getCIStatus(repo) {
  const runs = runCommand(`gh run list --repo ${repo} --limit 10 --json status,conclusion,name,createdAt,headBranch`);

  if (runs) {
    const runList = JSON.parse(runs);

    // Count by status
    const failed = runList.filter(r => r.conclusion === 'failure').length;
    const success = runList.filter(r => r.conclusion === 'success').length;
    const running = runList.filter(r => r.status === 'in_progress').length;

    console.log(`\n⚙️  CI/CD Status:`);
    if (failed > 0) console.log(`  🔴 ${failed} failed`);
    if (running > 0) console.log(`  🟡 ${running} in progress`);
    if (success > 0) console.log(`  ✅ ${success} passed`);

    // Show recent failures
    const recentFailures = runList.filter(r => r.conclusion === 'failure').slice(0, 3);
    if (recentFailures.length > 0) {
      console.log('\n  Recent Failures:');
      recentFailures.forEach(run => {
        console.log(`    - ${run.name} on ${run.headBranch}`);
      });
    }
  }
}

function main() {
  console.log('🔍 GitHub Activity Monitor');
  console.log('═'.repeat(50));

  REPOS.forEach(repo => {
    getPRs(repo);
    getIssues(repo);
    getCIStatus(repo);
    console.log('\n');
  });

  console.log('✨ Scan complete!');
}

main();
