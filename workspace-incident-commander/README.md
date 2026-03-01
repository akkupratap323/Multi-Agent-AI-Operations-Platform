<div align="center">

# AI Incident Commander

### Autonomous incident management for AWS infrastructure

*Detects anomalies → diagnoses with AI → pages on-call → executes approved fix → writes postmortem. Human effort: one Slack message.*

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![PM2](https://img.shields.io/badge/PM2-process_manager-2B037A?style=flat-square)](https://pm2.keymetrics.io)
[![AWS](https://img.shields.io/badge/AWS-Lightsail_·_EC2_·_CloudWatch-FF9900?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat-square&logo=openai&logoColor=white)](https://openai.com)

Part of [OpenClaw](../README.md) — a multi-agent AI operations platform.

</div>

---

## Live Incident — March 6, 2026

```
14:52:03  [MONITOR]    CPUUtilization: 91.3% on nester-ai-emotion (threshold: 85%)
                       Severity: P2 | No active maintenance window | Not in cooldown

14:52:05  [PIPELINE]   Checking deduplication... new incident
                       Similar past incident found: INC-2026-02-12-003 (MTTR: 4 min)
                       Resolution hint: restart + clear job queue resolved it last time

14:52:08  [DIAGNOSE]   Calling GPT-4o...
                       Metric context: CPU 91.3%, Burst 38%, StatusCheck: passing
                       Recent commits: 3 in last 24h (stt-refactor, job-queue-update, hotfix)
                       Root cause: Memory pressure from concurrent STT/TTS jobs accumulating
                       without session cleanup. Confidence: 0.87

14:52:11  [RESPOND]    Creating war room: #incident-2026-03-06-001
                       On-call: @Aditya (weekly schedule, day 3)
                       Posting page to Slack... ✓
                       Sending WhatsApp alert... ✓
                       Sending stakeholder email... ✓

                       Posted to war room:
                         Suggested fixes:
                           [1] aws lightsail reboot-instance        — LOW risk
                           [2] Scale to larger bundle (2GB→4GB)     — MEDIUM risk
                           [3] Reboot + clear /tmp job cache        — LOW risk
                         
                         Similar incident: INC-2026-02-12-003 → Fix #1 resolved it.
                         Type "approve 1", "approve 2", or "approve 3"

14:54:22  [RESOLVE]    Received: "approve 1" from @Aditya
                       Executing: aws lightsail reboot-instance --instance-name nester-ai-emotion
                       Waiting for instance to come back up...
                       Health check — CPU: 12.1% ✓  BurstCapacity: 81% ✓  StatusCheck: OK ✓

14:55:01  [POSTMORTEM] Generating report...
                       Saved: incidents/INC-2026-03-06-001.md
                       MTTD: 0 min | MTTA: 2 min 8s | MTTR: 2 min 50s
                       Status page updated: nester-ai-emotion → operational
```

---

## How It Works

The pipeline has 5 stages, each a standalone Node.js script orchestrated by `incident_pipeline.js`:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌─────────┐    ┌───────┐  │
│  │          │    │              │    │          │    │         │    │       │  │
│  │ MONITOR  │───►│   DIAGNOSE   │───►│ RESPOND  │───►│ RESOLVE │───►│  POST │  │
│  │          │    │              │    │          │    │         │    │ MORTEM│  │
│  │ CloudWatch    │  GPT-4o /    │    │ War room │    │ AWS CLI │    │  AI   │  │
│  │ 60s poll │    │  Gemini 2.5  │    │ + alerts │    │ + check │    │ report│  │
│  │          │    │              │    │          │    │         │    │       │  │
│  └────┬─────┘    └──────────────┘    └──────────┘    └────▲────┘    └───────┘  │
│       │                                                    │                   │
│       │ Pre-pipeline checks:                               │ Human approval:   │
│       │ • Deduplication (fingerprint)                      │ "approve 1" in   │
│       │ • Maintenance window suppression                   │ Slack war room   │
│       │ • Flapping detection (>5 alerts / 10 min)         │                   │
│       │ • Alert correlation (group related)                │                   │
│       │ • Similarity search (past incidents)               │                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Stage 1 — Monitor
Runs every 60 seconds. Pulls CloudWatch metrics for every Lightsail instance and EC2 instance in the configured region. Compares against configured thresholds (P1/P2/P3). If a threshold is breached, checks deduplication and maintenance windows before handing off to the pipeline.

### Stage 2 — Diagnose
Calls GPT-4o (Gemini 2.5 Flash as fallback). The prompt includes current metric values, the last 6 hours of metric history, recent git commits from monitored repos, and a summary of the most similar past incident. Returns structured JSON: root cause, confidence score, remediation suggestions, urgency level.

### Stage 3 — Respond
Creates a Slack channel for the incident (`#incident-YYYY-MM-DD-NNN`), posts the diagnosis and fix options, pages the current on-call engineer via Slack DM, sends WhatsApp and email alerts based on the severity workflow. Polls the war room channel every 3 seconds for an approval message.

### Stage 4 — Resolve
When approval is received, validates the command against a safety allowlist, executes via AWS CLI, waits for the instance to stabilise, runs a health check. If health check fails, posts a failure message back to the war room. Records the resolution in the database.

### Stage 5 — Postmortem
Calls the LLM to generate a structured postmortem from the incident record and timeline. Saves as a markdown file in `incidents/`, posts a summary to the war room, and updates the status page to operational.

---

## Feature Reference

### Incident Pipeline

| Feature | Detail |
|---------|--------|
| **Metric monitoring** | CPUUtilization, BurstCapacityPercentage, StatusCheckFailed (instance + system) |
| **Multi-service** | Lightsail instances, Lightsail databases, EC2 instances |
| **Severity levels** | P1 (≥95% CPU) · P2 (≥85%) · P3 (≥75%) — configurable per metric |
| **Alert cooldown** | Configurable per-resource cooldown to prevent repeat alerts |
| **Deduplication** | Fingerprint: `serviceType:resourceId:metric` — grouped into alert_groups |
| **Flapping detection** | >5 alerts for same fingerprint in 10 minutes = suppress |
| **Maintenance windows** | Database-backed scheduled suppression with auto-activate/complete |
| **Alert correlation** | Links alerts from dependent services into one incident |

### AI / LLM

| Feature | Detail |
|---------|--------|
| **Primary model** | OpenAI GPT-4o via `OPENAI_API_KEY` |
| **Fallback model** | Google Gemini 2.5 Flash via `GEMINI_API_KEY` |
| **Context passed** | Metric values, history, recent commits, past similar incidents |
| **Output** | Root cause, confidence, fix suggestions, urgency score |
| **Postmortem** | Full timeline, MTTD/MTTA/MTTR, contributing factors, action items |

### On-Call & Escalation

| Feature | Detail |
|---------|--------|
| **Schedules** | Daily or weekly rotation — stored in `on_call_schedules` table |
| **Overrides** | Point-in-time override for holidays, swaps |
| **Escalation policies** | Multi-level: schedule → lead → CTO — configurable timeouts |
| **Auto-escalation** | Cron checks every 5 min — escalates if not acknowledged |
| **Paging** | Slack DM + WhatsApp based on severity workflow |

### SLO & Analytics

| Feature | Detail |
|---------|--------|
| **SLO definitions** | Target %, time window, measurement type |
| **Error budget** | Tracks remaining budget; alerts at <10% remaining |
| **Burn rate** | Fast burn: >14× spend rate (P1) · Slow burn: >1× with <50% budget (P2) |
| **MTTD/MTTA/MTTR** | Calculated per incident, aggregated with P50/P95 percentiles |
| **Weekly report** | Slack post every Monday 9 AM — trend vs previous week |
| **Monthly report** | Slack post on 1st of month — full month breakdown |

### Runbooks & Auto-Remediation

| Feature | Detail |
|---------|--------|
| **Runbook library** | Pre-defined playbooks per service type and metric |
| **Safety filter** | Blocks destructive commands (rm -rf, terminate, delete) |
| **Auto-execute** | P3 incidents run the highest-confidence safe runbook automatically |
| **Execution tracking** | Logs every run to `runbook_executions`, tracks success rate |
| **Manual trigger** | `runbook run <id>` Slack command |

### Status Page

| Feature | Detail |
|---------|--------|
| **Components** | Per-service components (API, voice engine, database, etc.) |
| **States** | operational · degraded · partial_outage · major_outage |
| **Auto-update** | Updates on incident open, auto-resolves when incident is closed |
| **History** | `status_page_updates` table with full change log |
| **Slack summary** | Posts status page snapshot to #incidents on request |

### Predictive Alerts

| Feature | Detail |
|---------|--------|
| **Method** | Linear regression over 6h of metric history |
| **Prediction window** | Warns if threshold breach predicted within 6 hours |
| **Coverage** | CPUUtilization, BurstCapacityPercentage |
| **Output** | Slack warning with projected breach time and confidence |

---

## Slack Bot Commands

Type these in the `#incidents` channel:

```bash
help                      Show all commands and usage

# Incidents
incident list             List recent incidents with status and MTTR
incident create           Manually open an incident (prompts for details)

# On-call
oncall who                Who is on-call right now + contact info
oncall schedule           This week's full rotation + overrides

# Infrastructure
status                    Live infra status — all components + current metrics

# Runbooks
runbook list              All available runbooks with auto-execute flag
runbook run <id>          Execute a runbook (requires approval for non-P3)

# SLOs
slo                       All SLO targets, current health, error budget remaining

# Maintenance
maintenance list          Upcoming maintenance windows

# Reports
report weekly             Generate + post 7-day incident metrics now
report monthly            Generate + post 30-day incident metrics now
metrics                   MTTD / MTTA / MTTR summary with percentiles
```

---

## Severity Playbooks

| | P1 | P2 | P3 |
|--|----|----|-----|
| Threshold (CPU) | ≥95% | ≥85% | ≥75% |
| War room | ✅ created | ✅ created | ❌ Slack only |
| Page on-call | ✅ immediate | ✅ immediate | ❌ |
| WhatsApp alert | ✅ | ✅ | ❌ |
| Email stakeholders | ✅ | ✅ | ❌ |
| Escalate if no ack | 3 min | 5 min | — |
| Auto-remediate | ❌ human required | ❌ human required | ✅ if safe runbook exists |

---

## Process Architecture (PM2)

Three persistent processes keep the system alive:

```
ic-monitor     node scripts/monitor.js
               ├── Polls AWS CloudWatch every 60s
               ├── Runs pre-pipeline checks (dedup, maintenance, SLO)
               ├── Runs predictive analysis each cycle
               └── Triggers incident_pipeline.js on threshold breach

ic-slack-bot   node scripts/slack_bot.js
               ├── Polls #incidents channel every 3s
               └── Routes commands to appropriate handlers

ic-scheduler   node scripts/scheduler.js (node-cron)
               ├── Every 1 min  — maintenance window activation
               ├── Every 5 min  — escalation checks
               ├── Every 1 hour — SLO measurement collection
               ├── Monday 9 AM  — weekly report
               └── 1st/month 9 AM — monthly report
```

**PM2 commands:**
```bash
pm2 start ecosystem.config.js   # start all 3
pm2 logs                        # stream all output
pm2 logs ic-monitor             # monitor only
pm2 monit                       # live dashboard
pm2 stop ecosystem.config.js    # stop all
```

---

## Database Schema

15 tables across two versions:

```sql
-- v1 (core)
incidents            -- id, service, metric, severity, status, timestamps, postmortem
incident_timeline    -- immutable event log (every state change)

-- v2 (extended)
on_call_schedules       on_call_overrides       escalation_policies
service_catalog         service_dependencies
runbooks                runbook_executions
slo_definitions         slo_measurements
maintenance_windows
status_page_components  status_page_updates
alert_groups
```

Setup:
```bash
node scripts/setup_db.js      # v1 tables
node scripts/setup_db_v2.js   # v2 tables
node scripts/seed_data.js     # initial data: on-call, runbooks, SLOs, status components
```

---

## Setup

### 1. Prerequisites

```bash
node --version     # 18+
aws configure      # configured with Lightsail / EC2 / CloudWatch read access
npm install -g pm2
```

You'll also need:
- A Slack app with `chat:write`, `channels:read`, `channels:history`, `conversations.create` scopes
- A Neon PostgreSQL account (free tier is sufficient)
- At least one of: OpenAI API key or Gemini API key

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — required fields:

```bash
SLACK_BOT_TOKEN=xoxb-...           # from api.slack.com/apps
SLACK_FALLBACK_CHANNEL=C0...       # channel ID for alerts
NEON_DB_URL=postgresql://...       # from neon.tech dashboard
GEMINI_API_KEY=AIza...             # or OPENAI_API_KEY — at least one required
AWS_REGION=us-west-2
```

### 3. First-time setup

```bash
./start.sh --setup
```

This runs `npm install`, creates all DB tables, seeds initial data (on-call schedule, sample runbooks, SLO definitions, status page components), and starts all three PM2 processes.

### 4. Subsequent starts

```bash
./start.sh     # start
./stop.sh      # stop
```

---

## Configuration

All thresholds and settings are in `scripts/config.js` (loaded from `.env`):

```js
// Thresholds — edit these to match your infrastructure
THRESHOLDS: {
  lightsail: {
    CPUUtilization:         { p1: 95, p2: 85, p3: 75 },
    BurstCapacityPercentage:{ p1: 10, p2: 20, p3: 30 },  // inverted
    StatusCheckFailed:      { p1: 1 }
  },
  ec2: {
    CPUUtilization:         { p1: 90, p2: 80, p3: 70 }
  }
}

ALERT_COOLDOWN_MINUTES: 30     // wait before re-alerting same resource+metric
POLL_INTERVAL_MS: 60000        // how often to poll AWS
TIMEZONE: 'Asia/Kolkata'       // for cron schedules
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | ✅ | Bot token from api.slack.com/apps |
| `SLACK_FALLBACK_CHANNEL` | ✅ | Channel ID for fallback alerts |
| `NEON_DB_URL` | ✅ | PostgreSQL connection string (Neon) |
| `OPENAI_API_KEY` | ⚠️ | GPT-4o (falls back to Gemini if missing) |
| `GEMINI_API_KEY` | ⚠️ | Gemini 2.5 Flash (at least one LLM key required) |
| `OPENAI_MODEL` | | Override model name (default: `gpt-4o`) |
| `GEMINI_MODEL` | | Override model name (default: `gemini-2.5-flash`) |
| `AWS_REGION` | ✅ | AWS region to monitor |
| `WHATSAPP_TO` | Optional | Phone number for WhatsApp alerts |
| `GMAIL_CREDENTIALS` | Optional | Path to Gmail OAuth credentials JSON |
| `STAKEHOLDER_EMAILS` | Optional | Comma-separated emails for incident alerts |
| `ON_CALL_SLACK_USER` | Optional | Fallback Slack user ID when no schedule set |
| `GITHUB_REPOS` | Optional | `org/repo` for commit context in diagnosis |
| `TIMEZONE` | Optional | Cron timezone (default: `Asia/Kolkata`) |
| `ALERT_COOLDOWN_MINUTES` | Optional | Minutes between same-resource alerts (default: `30`) |

---

## Example Postmortem

```markdown
# Postmortem — INC-2026-03-06-001

**Date:** March 6, 2026  
**Severity:** P2  
**Service:** lightsail/nester-ai-emotion  
**Status:** Resolved  

## Metrics
| | Value |
|--|-------|
| MTTD | 0 min (automated detection) |
| MTTA | 2 min 8s |
| MTTR | 2 min 50s |
| Duration | 2 min 50s |

## Summary
High CPU utilisation (91.3%) caused degraded response times on the emotion 
detection API. Resolved by restarting the instance, clearing accumulated 
STT/TTS jobs from memory.

## Root Cause
Memory pressure from the concurrent job queue: STT/TTS processing tasks 
accumulated without cleanup between sessions. As the queue grew, CPU 
saturation caused cascading latency across all API endpoints.

## Timeline
| Time | Event |
|------|-------|
| 14:52:03 | Anomaly detected — CPU 91.3% |
| 14:52:08 | AI diagnosis complete (confidence: 0.87) |
| 14:52:11 | War room created, on-call paged |
| 14:54:22 | Fix #1 approved by @Aditya |
| 14:55:01 | Health check passed — CPU 12.1% |

## Action Items
- [HIGH] Add job queue size limit with graceful rejection at capacity
- [HIGH] Implement session-end cleanup hook in STT/TTS job handler  
- [MEDIUM] Add CloudWatch alarm for memory utilisation (currently unmonitored)
- [LOW] Add automated P3 restart runbook for future recurrence
```

---

<div align="center">

**Part of [OpenClaw](../README.md)** — a multi-agent AI operations platform for Nester Labs

Built by **Aditya** · Inspired by PagerDuty, Rootly, incident.io · *Built without the invoice*

</div>
