# Security

## Secret Management

All credentials are stored in per-workspace `.env` files — never committed to source control.

### What's gitignored

```
.env              — all workspace credentials
*.env             — any env variant
identity/         — OpenClaw agent identity keys
devices/          — registered device credentials
credentials/      — OAuth credential files
openclaw.json     — LLM provider API keys + agent registry
gmail-credentials.json
google-token.json
*.bak             — backup files that may contain secrets
logs/             — PM2 logs (may contain request data)
cron/             — OpenClaw runtime session logs
```

### Credential Inventory

| Secret | Used By | Where to Get It |
|--------|---------|-----------------|
| `SLACK_BOT_TOKEN` | All agents | api.slack.com/apps → OAuth & Permissions |
| `SLACK_WEBHOOK_URL` | Squad Brain | api.slack.com/apps → Incoming Webhooks |
| `OPENAI_API_KEY` | Incident Commander | platform.openai.com/api-keys |
| `GEMINI_API_KEY` | Incident Commander (fallback) | aistudio.google.com/app/apikey |
| `NEON_DB_URL` | Incident Commander, Dev Monitor | console.neon.tech → Connection string |
| `NEON_API_KEY` | Dev Monitor, Personal Assistant | console.neon.tech → API Keys |
| `GITHUB_TOKEN` | Dev Monitor | github.com/settings/tokens (repo + workflow) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Incident Commander | AWS IAM → create access key |
| `GMAIL_CREDENTIALS` | Personal Assistant | Google Cloud Console → OAuth 2.0 |
| `GOOGLE_TOKEN` | Personal Assistant | Generated locally via `node authorize-google.js` |
| `IFTTT_WEBHOOK_KEY` | AI News Agent | ifttt.com → Webhooks service |
| `OPENCLAW_TOKEN` | Squad Brain webhook relay | openclaw.json (agent identity) |

### File Permissions

All credential files should be `600` (owner read/write only):

```bash
chmod 600 workspace-*/. env
chmod 600 gmail-credentials.json google-token.json openclaw.json
```

### Rotation Checklist

If any secret may have been exposed:

- [ ] Rotate the token immediately at the provider (Slack, OpenAI, GitHub, etc.)
- [ ] Update the `.env` file in the relevant workspace
- [ ] Restart the affected agent process (`pm2 restart <name>` or `./start.sh`)
- [ ] Check git log for any accidental commits: `git log --all -p | grep -i "xoxb-\|sk-proj-\|ghp_"`
- [ ] If found in history, rewrite with `git filter-branch` or `git-filter-repo`
- [ ] Revoke the old token at the provider even after rotation

### Reporting a Vulnerability

If you find a security issue in this codebase, open a private GitHub Security Advisory on this repository rather than a public issue.
