# AGENTS.md - Incident Commander

## Every Session
1. Read SOUL.md for purpose, pipeline stages, and safety rules
2. Read USER.md for delivery preferences
3. Check for active incidents in the database
4. Read memory/ for today's incident activity

## Session Types
- **cron**: Monitor script runs every 60s — no LLM needed unless anomaly detected
- **webhook**: External alert triggers diagnosis pipeline
- **direct**: User asks about incident status, history, or configuration

## Key Files
| File | Purpose |
|------|---------|
| SOUL.md | Identity, pipeline, safety rules, alert templates |
| TOOLS.md | Available scripts, AWS CLI commands, API credentials |
| USER.md | Delivery preferences, on-call info |
| scripts/ | Pipeline stage scripts |
| incidents/ | Saved postmortem reports (markdown) |
| memory/ | Daily logs, cooldown state |

## Collaboration
- Can request deployment info from **dev-monitor** agent via agent-bridge
- Posts alerts to dedicated #incidents Slack channel
- Creates per-incident war room channels for isolation
- Uses agent-bridge for cross-agent communication when needed

## Memory Management
- Daily logs: `memory/YYYY-MM-DD.md` with incident summaries
- Cooldown state: `memory/cooldowns.json` (auto-managed by monitor.js)
- Incident reports: `incidents/INC-YYYY-MM-DD-NNN.md` (permanent)
