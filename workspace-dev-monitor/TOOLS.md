# TOOLS.md - Dev Monitor Tools

## GitHub CLI (gh)

**Authentication:** Using personal access token
**Token:** ``
**Scopes:** Full repo access, workflows, issues, PRs

### Setup GitHub Token

```bash
# If gh CLI needs re-auth
echo "" | gh auth login --with-token
```

## Monitoring Scripts

### 1. Check GitHub Activity

```bash
node ~/.openclaw/workspace-dev-monitor/scripts/check_github.js
```

**Output:**
- Open PRs with review status
- Recently merged PRs (last 24h)
- Open issues
- CI/CD status
- Recent failures

### 2. Daily Dev Report

```bash
node ~/.openclaw/workspace-dev-monitor/scripts/daily_dev_report.js
```

**Output:**
- Summary of all GitHub activity
- Sends to Slack automatically
- Standup-ready format

### 3. Alert Failed Builds

```bash
node ~/.openclaw/workspace-dev-monitor/scripts/alert_failed_builds.js
```

**Output:**
- Monitors CI/CD for failures in last hour
- Sends immediate Slack alerts with logs
- Tags @here for urgent attention

## Slack Integration

**Bot Token:** ``
**Channel:** `C0AFZ4RNNM6` (all-nester-labs-agents-testing)

### Send Alert to Slack

```bash
curl -s -X POST \
  -H 'Authorization: Bearer ' \
  -H 'Content-Type: application/json' \
  -d '{"channel":"C0AFZ4RNNM6","text":"Alert message"}' \
  'https://slack.com/api/chat.postMessage'
```

## GitHub API Commands

### List Open PRs

```bash
gh pr list --repo Terrorizer-AI/opentelemetry-js --state open \
  --json number,title,author,createdAt,updatedAt,reviewDecision
```

### List Merged PRs (Last 24h)

```bash
gh pr list --repo Terrorizer-AI/opentelemetry-js --state merged \
  --json number,title,author,mergedAt --limit 50
```

### Check CI/CD Runs

```bash
gh run list --repo Terrorizer-AI/opentelemetry-js --limit 20 \
  --json databaseId,name,status,conclusion,headBranch,createdAt
```

### View Failed Run Logs

```bash
gh run view RUN_ID --repo Terrorizer-AI/opentelemetry-js --log-failed
```

### List Open Issues

```bash
gh issue list --repo Terrorizer-AI/opentelemetry-js --state open \
  --json number,title,labels,assignees
```

## Monitored Repositories

Add more repos to monitor by editing the `REPOS` array in each script:

```javascript
const REPOS = [
  'Terrorizer-AI/opentelemetry-js',
  // Add more repos here:
  // 'your-org/your-repo',
];
```

## Agent Collaboration

### Send Report to Rex

```bash
node ~/.openclaw/shared/agent-bridge.js send squad-brain "GitHub report: [content]"
```

### Request from Other Agents

```bash
# Other agents can request GitHub status
node ~/.openclaw/shared/agent-bridge.js request dev-monitor "show open PRs"
```

## Automated Scheduling

Add to crontab (`crontab -e`):

```bash
# Daily dev report at 9:00 AM
0 9 * * * /usr/bin/node ~/.openclaw/workspace-dev-monitor/scripts/daily_dev_report.js >> ~/.openclaw/logs/dev-report.log 2>&1

# Monitor builds every 15 minutes
*/15 * * * * /usr/bin/node ~/.openclaw/workspace-dev-monitor/scripts/alert_failed_builds.js >> ~/.openclaw/logs/build-alerts.log 2>&1

# Full GitHub check at 5 PM (EOD)
0 17 * * * /usr/bin/node ~/.openclaw/workspace-dev-monitor/scripts/check_github.js >> ~/.openclaw/logs/github-check.log 2>&1
```

## Environment Variables

Optional - can be set in scripts or environment:

```bash
export GITHUB_TOKEN=""
export SLACK_BOT_TOKEN=""
export SLACK_CHANNEL="C0AFZ4RNNM6"
```

## Troubleshooting

### GitHub API Rate Limits

```bash
# Check current rate limit
gh api rate_limit
```

### Test Slack Connection

```bash
curl -s -H 'Authorization: Bearer ' \
  'https://slack.com/api/auth.test' | python3 -m json.tool
```

### Manual PR Check

```bash
# Check specific PR
gh pr view 123 --repo Terrorizer-AI/opentelemetry-js

# Check PR status
gh pr checks 123 --repo Terrorizer-AI/opentelemetry-js
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Check all GitHub activity | `node check_github.js` |
| Generate dev report | `node daily_dev_report.js` |
| Monitor builds | `node alert_failed_builds.js` |
| List open PRs | `gh pr list --repo REPO` |
| View failed build | `gh run view RUN_ID --log-failed` |
| Check issues | `gh issue list --repo REPO` |
