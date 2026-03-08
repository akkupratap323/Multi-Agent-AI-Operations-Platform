#!/usr/bin/env node

/**
 * Failed Build Alerter
 * Monitors CI/CD and sends alerts for failures
 */

const { execSync } = require('child_process');

const REPOS = ['Terrorizer-AI/opentelemetry-js'];
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    return null;
  }
}

function checkForFailures(repo) {
  const failures = [];

  const runsData = runCommand(`gh run list --repo ${repo} --limit 10 --json databaseId,name,status,conclusion,headBranch,createdAt,event`);

  if (runsData) {
    const runs = JSON.parse(runsData);

    // Get recent failures (last 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    runs.forEach(run => {
      if (run.conclusion === 'failure' && new Date(run.createdAt) > oneHourAgo) {
        failures.push({
          id: run.databaseId,
          name: run.name,
          branch: run.headBranch,
          event: run.event,
          createdAt: run.createdAt
        });
      }
    });
  }

  return failures;
}

async function sendAlert(repo, failure) {
  const repoName = repo.split('/')[1];
  const message = `🔴 *Build Failed*

*Repo:* ${repoName}
*Workflow:* ${failure.name}
*Branch:* ${failure.branch}
*Event:* ${failure.event}

<https://github.com/${repo}/actions/runs/${failure.id}|View logs →>

cc: @here - needs attention!`;

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
      console.log(`✅ Alert sent for ${failure.name}`);
    } else {
      console.log('⚠️  Slack API failed:', data.error);
    }
  } catch (error) {
    console.log('⚠️  Could not send alert:', error.message);
  }
}

async function main() {
  console.log('🔍 Checking for failed builds...\n');

  let totalFailures = 0;

  for (const repo of REPOS) {
    const failures = checkForFailures(repo);

    if (failures.length > 0) {
      console.log(`❌ Found ${failures.length} recent failures in ${repo}`);

      for (const failure of failures) {
        await sendAlert(repo, failure);
        totalFailures++;
      }
    } else {
      console.log(`✅ No recent failures in ${repo}`);
    }
  }

  if (totalFailures === 0) {
    console.log('\n🎉 All builds passing!');
  } else {
    console.log(`\n⚠️  ${totalFailures} failure alert(s) sent`);
  }
}

main();
