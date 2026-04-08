<div align="center">

# Multi-Agent AI Operations Platform

### Built on [OpenClaw](https://github.com/openclaw)

*5 specialized AI agents running 24/7 — handling incidents, monitoring code, managing email, posting to social, and keeping the team in sync. Automatically.*

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-CC785C?style=flat-square)](https://claude.ai)
[![AWS](https://img.shields.io/badge/AWS-Lightsail_·_EC2-FF9900?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech)
[![Slack](https://img.shields.io/badge/Slack-API-4A154B?style=flat-square&logo=slack&logoColor=white)](https://api.slack.com)

<br/>

[![Watch the platform demo](https://img.shields.io/badge/▶%20Watch%20Full%20Demo-LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/feed/update/urn:li:activity:7429348815134081024/)

</div>

---

## What is this?

This is a **multi-agent AI operations system** built on top of [OpenClaw](https://github.com/openclaw) — an open-source agent orchestration platform. Instead of one general-purpose AI assistant, it runs **five domain-expert agents in parallel**, each owning a specific slice of operations:

| Agent | Owns | Trigger |
|-------|------|---------|
| 🚨 **Incident Commander** | AWS infrastructure health, incidents, postmortems | Continuous (60s poll) |
| 🔧 **Dev Monitor** | GitHub PRs, CI/CD builds, database health | Continuous + webhooks |
| 📋 **Personal Assistant** | Email, calendar, daily briefings | Scheduled + on-demand |
| 🧠 **Squad Brain** | Team standups, planning, casual comms | Slack messages |
| 📡 **AI News** | Twitter/X monitoring, auto-repost | IFTTT webhooks |

Each agent lives in its own OpenClaw workspace with its own identity, tools, and memory. They communicate through a shared **Agent Bridge**. Slack is the control plane — agents post there, humans respond there.

> **OpenClaw** is the open-source runtime that makes this possible — handling agent identity, workspace isolation, tool execution, and inter-agent messaging. This repo contains the agents and automation logic built on top of it.

---

## Live Demo — Incident Commander

A real incident that ran through the full pipeline end-to-end:

```
14:52  MONITOR       CPU spike detected — my-api-server: 91.3% (threshold: 85%)
                     Severity: P2 | Service: lightsail/my-api-server

14:52  DIAGNOSE      GPT-4o analysing metrics + recent commits...
                     Root cause: Memory leak in STT/TTS job queue — tasks accumulating
                     without cleanup between sessions. Confidence: 0.87

14:52  RESPOND       War room created: #incident-2026-03-06-001
                     Paging on-call engineer via Slack + WhatsApp
                     Stakeholder email sent

                     Suggested fixes:
                       [1] Restart instance           — low risk, ~2 min downtime
                       [2] Scale to larger bundle     — medium risk, no downtime
                       [3] Reboot + clear job cache   — low risk, ~3 min

14:54  RESOLVE       On-call: "approve 1"
                     Executing: aws lightsail reboot-instance --instance-name my-api-server
                     Health check... CPU: 12% ✓  StatusCheck: passed ✓

14:55  POSTMORTEM    INC-2026-03-06-001.md saved
                     MTTD: 0 min | MTTA: 2 min | MTTR: 3 min
                     Action items: add queue size limit, add memory CloudWatch alarm
```

Total human effort: **typing "approve 1"**. Everything else was the agent.

---

## System Architecture

```
                        ┌─────────────────────────────────┐
                        │         OPENCLAW PLATFORM        │
                        │                                 │
   AWS CloudWatch ─────►│  🚨 INCIDENT COMMANDER          │──► Slack War Room
   Lightsail / EC2      │     monitor → diagnose →        │──► WhatsApp
                        │     respond → resolve →         │──► Email
                        │     postmortem                  │──► Neon DB (incidents)
                        │                                 │
   GitHub API ─────────►│  🔧 DEV MONITOR                 │──► Slack #dev-reports
   GitHub Webhooks      │     PRs · builds · DB health    │──► Slack #alerts
                        │                                 │
   Gmail API ──────────►│  📋 PERSONAL ASSISTANT          │──► Slack briefing
   Google Calendar      │     email · calendar · voice    │──► Voice (macOS TTS)
                        │                                 │
   Slack Messages ─────►│  🧠 SQUAD BRAIN (Rex)           │──► Slack replies
                        │     standups · planning         │──► Team DMs
                        │                                 │
   IFTTT Webhooks ─────►│  📡 AI NEWS AGENT               │──► Twitter/X
   Twitter/X Feed       │     classify · auto-repost      │──► Slack #ai-news
                        │                                 │
                        │     ╔═══════════════════╗       │
                        │     ║   Agent Bridge    ║       │
                        │     ║  (inter-agent     ║       │
                        │     ║   messaging)      ║       │
                        │     ╚═══════════════════╝       │
                        └─────────────────────────────────┘
                                       │
                               Neon PostgreSQL
                          (incidents · SLOs · on-call
                           runbooks · analytics)
```

---

## The Agents

### 🚨 Incident Commander
> *The most complex agent. Replaces PagerDuty + Datadog + Rootly.*

Watches AWS infrastructure around the clock. When something breaks, it diagnoses the cause using AI, assembles a Slack war room, pages the on-call engineer, waits for approval, executes the fix, and writes the postmortem. No human needs to touch a terminal.

**Pipeline stages:**

```
Monitor (60s)  →  Deduplicate  →  Diagnose (AI)  →  Respond  →  Resolve  →  Postmortem
     │               │                  │               │            │            │
  CloudWatch     Fingerprint       GPT-4o /        War room      AWS CLI      Markdown
  thresholds     + flapping        Gemini 2.5      + page        + health     + DB save
                 detection         Flash           + alerts      check
```

**Feature set:**

| Feature | How it works |
|---------|-------------|
| Multi-metric monitoring | CPU, BurstCapacity, StatusCheck across Lightsail + EC2 |
| AI root cause analysis | LLM gets metrics, recent git commits, similar past incidents |
| Severity workflows | P1/P2/P3 trigger different response playbooks |
| On-call schedules | Weekly/daily rotation with overrides and escalation policies |
| Runbook engine | Pre-defined fix playbooks; P3 auto-executes without human approval |
| Alert deduplication | Fingerprint-based grouping + flapping detection (>5 in 10 min) |
| SLO tracking | Error budget with fast burn (14×) and slow burn (1×) alerts |
| Predictive alerts | Linear regression on 6h history — warns 6h before breach |
| Incident similarity | Matches new incidents to past ones, surfaces past resolution steps |
| Status page | Component-based (operational / degraded / partial / major outage) |
| Maintenance windows | Scheduled suppression of alerts during planned work |
| Analytics | MTTD / MTTA / MTTR with P50/P95 percentiles + weekly/monthly Slack reports |
| Slack bot | 15+ commands: `oncall who`, `slo`, `runbook run`, `report weekly`, etc. |

**Runs as 3 PM2 processes:**
```
ic-monitor      polls AWS every 60s, triggers pipeline on anomaly
ic-slack-bot    polls #incidents every 3s for commands
ic-scheduler    cron: escalations (5 min), SLO (1 hr), reports (weekly/monthly)
```

---

### 🔧 Dev Monitor
> *Your eyes on GitHub so you don't have to be.*

Tracks everything happening in your repos — open PRs, stale reviews, CI/CD failures, new user signups in the database. Sends a standup-ready report every morning so engineers start the day with full context.

**Capabilities:**
- Open PRs with review status (approved / changes requested / pending)
- Stale PR detection (>7 days without update) with Slack nudge
- Immediate Slack alert on CI/CD failure with run link and branch context
- Neon PostgreSQL health monitoring — query counts, connection limits, new users
- Daily 9 AM dev report with shipped yesterday / open today / blocked items

**Alert escalation:**
```
🔴 Immediate   — CI failure on main/master, production deploy failure
🟡 Within 1h   — Feature branch build failure, PR stale >7 days
🟢 Daily       — General activity digest, new issues, merged PRs
```

---

### 📋 Personal Assistant
> *Handles everything that interrupts deep work.*

Manages the founder's inbox, calendar, and daily context so they don't have to context-switch to check email or remember what's next. Delivers voice briefings on macOS.

**Daily schedule:**
```
08:00  Morning briefing — weather, calendar, top 3 priorities, GitHub activity
       Before meetings  — agenda recap and attendee context
18:00  Evening wrap-up  — what shipped, what's tomorrow
```

**Integrations:** Gmail API (read/draft/flag), Google Calendar (view/remind), macOS TTS (spoken briefings), Neon DB (team activity)

---

### 🧠 Squad Brain — Rex
> *A team member that shows up in Slack, not a bot that answers prompts.*

Rex is the informal team communication agent — runs standups, helps with planning, responds to messages with actual context, and relays reports from other agents in real time.

**What makes Rex different:**
- Receives live GitHub events via webhook relay — knows when a build breaks before anyone else does
- Acts as a communication hub: Dev Monitor → Rex → team, Incident Commander → Rex → engineers
- Understands team context from memory logs — not just the current message

---

### 📡 AI News Agent
> *Your Twitter presence, automated.*

Watches Twitter/X for AI and tech news, classifies every tweet, and auto-reposts the relevant ones without anyone having to curate manually.

**Content it auto-posts:**
- AI model releases and research papers (OpenAI, Anthropic, Google, Meta)
- Voice AI, speech synthesis, NLP breakthroughs
- Major cloud / DevOps product launches
- Anything NVIDIA GPU or LLM infrastructure related

**Flow:** IFTTT monitors Twitter → webhook to relay → AI News Agent classifies → auto-post via IFTTT if worthy → Slack digest for every tweet

---

## Agent Collaboration

Agents communicate through `shared/agent-bridge.js` — a lightweight inter-agent messaging layer that routes messages to any agent via the OpenClaw daemon.

```js
// Incident Commander pages Squad Brain during a P1
sendToAgent('squad-brain',
  'P1 on my-api-server — CPU 97%. War room: #incident-2026-03-06-001. Need all hands.'
);

// Dev Monitor sends a failed build to Squad Brain
sendToAgent('squad-brain',
  'Build failed: main branch CI. Link: [run url]'
);

// Squad Brain broadcasts a standup summary to the team
broadcast('Good morning team — 3 open PRs, 1 stale (review needed), no failed builds. Shipping day.');
```

**Registered capability map:**
```
squad-brain        → slack, whatsapp, chat, email, calendar, tweets
ai-news            → twitter, news-monitoring, content-curation
assistant          → email, calendar, briefings, automation
dev-monitor        → github, ci-cd, pr-tracking, build-alerts, dev-reports
incident-commander → aws-monitoring, incident-management, auto-remediation, postmortem
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Agent Runtime | Claude Code (claude-sonnet-4-6) | Reasoning, planning, tool use |
| Language | Node.js 18+ / Python 3.11 | Agent scripts and utilities |
| Database | Neon PostgreSQL (serverless) | Incidents, SLOs, on-call, analytics |
| Primary LLM | OpenAI GPT-4o | Diagnosis, postmortems, classification |
| Fallback LLM | Google Gemini 2.5 Flash | LLM fallback when OpenAI unavailable |
| Cloud | AWS Lightsail + EC2 + CloudWatch | Infrastructure being monitored |
| Messaging | Slack API | Primary human-agent interface |
| Notifications | WhatsApp + Gmail API | High-severity alerting |
| Social | Twitter/X via IFTTT | AI News auto-posting |
| Process Manager | PM2 | Keeps incident-commander running 24/7 |
| Scheduler | node-cron | Reports, escalations, maintenance checks |
| Auth | Google OAuth 2.0 | Gmail + Calendar access |

---

## Repository Structure

```
.openclaw/
│
├── README.md                        ← You are here
├── .gitignore                       ← Covers all secrets + credentials
├── package.json                     ← Shared deps (pg, googleapis)
├── openclaw.json                    ← Agent registry + LLM provider config
│
├── shared/
│   └── agent-bridge.js              ← Inter-agent messaging system
│
├── workspace-incident-commander/    ← 🚨 AWS monitoring + incident pipeline
│   ├── README.md                    ← Detailed agent docs
│   ├── package.json                 ← dotenv, node-cron, pg
│   ├── ecosystem.config.js          ← PM2: 3 processes
│   ├── start.sh / stop.sh           ← One-command startup
│   ├── .env.example                 ← Template (fill in and copy to .env)
│   └── scripts/
│       ├── monitor.js               ← Stage 1: poll AWS every 60s
│       ├── diagnose.js              ← Stage 2: AI root cause analysis
│       ├── respond.js               ← Stage 3: war room + alerts
│       ├── resolve.js               ← Stage 4: human-approved fix execution
│       ├── postmortem.js            ← Stage 5: AI report generation
│       ├── incident_pipeline.js     ← Orchestrator (chains all stages)
│       ├── slack_bot.js             ← Command handler for #incidents
│       ├── scheduler.js             ← Cron jobs
│       ├── setup_db.js / setup_db_v2.js  ← DB schema (15 tables)
│       ├── seed_data.js             ← Initial data (runbooks, SLOs, on-call)
│       └── utils/
│           ├── cloudwatch.js        ← AWS CLI wrappers
│           ├── slack.js             ← Slack API helpers
│           ├── llm.js               ← OpenAI + Gemini with fallback
│           ├── oncall.js            ← On-call schedules + escalations
│           ├── runbook.js           ← Automated fix playbooks
│           ├── dedup.js             ← Alert fingerprinting + flapping
│           ├── slo.js               ← SLO definitions + error budget
│           ├── similarity.js        ← Past incident matching
│           ├── analytics.js         ← MTTD/MTTA/MTTR metrics
│           ├── predictive.js        ← Linear regression warnings
│           ├── workflows.js         ← P1/P2/P3 response playbooks
│           ├── maintenance.js       ← Maintenance window suppression
│           ├── status_page.js       ← Component status management
│           └── service_catalog.js   ← Service registry + impact graph
│
├── workspace-dev-monitor/           ← 🔧 GitHub + CI/CD + DB watchdog
│   ├── .env.example
│   └── scripts/
│       ├── config.js                ← dotenv config
│       ├── check_github.js          ← Full GitHub activity scan
│       ├── daily_dev_report.js      ← Morning standup report
│       ├── alert_failed_builds.js   ← Real-time CI/CD failure alerts
│       ├── monitor_neon_db.js       ← Neon DB health via management API
│       └── monitor_new_users.js     ← New user signup tracking
│
├── workspace-assistant/             ← 📋 Email, calendar, briefings
│   ├── .env.example
│   └── scripts/
│       ├── morning_briefing.js      ← Comprehensive daily briefing
│       ├── check_inbox.js           ← Gmail monitoring
│       ├── check_calendar.js        ← Google Calendar integration
│       └── voice_daemon.py          ← macOS TTS voice output
│
├── workspace-squad-brain/           ← 🧠 Rex — team communication agent
│   ├── .env.example
│   └── scripts/
│       ├── morning_briefing.js      ← Rex's standup briefing
│       ├── check_calendar.js        ← Schedule awareness
│       └── github-webhook-relay.sh  ← Live GitHub event relay
│
└── workspace-ai-news/               ← 📡 Twitter/X content automation
    ├── .env.example
    └── scripts/
        └── ifttt-tweet-relay.sh     ← IFTTT webhook → classify → post
```

---

## Database Schema

The incident-commander agent uses Neon PostgreSQL with **15 tables** across two schema versions:

**Core (v1):**
- `incidents` — full lifecycle (open → acknowledged → resolved)
- `incident_timeline` — immutable audit trail of every event

**Extended (v2):**
- `on_call_schedules`, `on_call_overrides`, `escalation_policies`
- `service_catalog`, `service_dependencies`
- `runbooks`, `runbook_executions`
- `slo_definitions`, `slo_measurements`
- `maintenance_windows`
- `status_page_components`, `status_page_updates`
- `alert_groups`

---

## Setup

### Prerequisites

```
Node.js 18+       node --version
AWS CLI           aws --version  (configured with your account)
PM2               npm install -g pm2
PostgreSQL        Neon free tier works — https://neon.tech
Slack app         api.slack.com/apps → create bot with chat:write, channels:read
```

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/akkupratap323/Multi-Agent-AI-Operations-Platform
cd Multi-Agent-AI-Operations-Platform

# 2. Install shared dependencies
npm install

# 3. Start Incident Commander
cd workspace-incident-commander
cp .env.example .env
# fill in SLACK_BOT_TOKEN, NEON_DB_URL, OPENAI_API_KEY in .env
./start.sh --setup        # creates DB tables, seeds data, starts PM2

# 4. Verify it's running
pm2 status
pm2 logs ic-monitor
```

### Running Other Agents

```bash
# Dev Monitor — GitHub + CI/CD
cd workspace-dev-monitor
cp .env.example .env      # fill in SLACK_BOT_TOKEN, GITHUB_TOKEN, NEON_DB_URL
node scripts/check_github.js
node scripts/daily_dev_report.js

# Personal Assistant — email + calendar
cd workspace-assistant
cp .env.example .env      # fill in SLACK_BOT_TOKEN, NEON_API_KEY
node scripts/morning_briefing.js

# Squad Brain + AI News — run inside OpenClaw daemon (no manual start needed)
```

### Environment Variables

Each workspace has its own `.env.example`. Key variables:

```bash
SLACK_BOT_TOKEN=xoxb-...         # From api.slack.com/apps

# Incident Commander
NEON_DB_URL=postgresql://...     # Neon connection string
OPENAI_API_KEY=sk-proj-...       # Primary LLM
GEMINI_API_KEY=AIza...           # Fallback LLM
AWS_REGION=us-east-1

# Dev Monitor
GITHUB_TOKEN=ghp_...             # GitHub PAT (repo + workflow read)
NEON_API_KEY=napi_...

# Personal Assistant
GMAIL_CREDENTIALS=/path/to/gmail-credentials.json
GMAIL_TOKEN=/path/to/google-token.json

# Squad Brain
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## Slack Bot Commands

Type these in `#incidents` (incident-commander):

```
help                    Show all available commands
status                  Live infrastructure overview
incident list           Recent incidents with status
incident create         Manually open an incident
oncall who              Who is on-call right now
oncall schedule         This week's full rotation
runbook list            Available automated runbooks
runbook run <id>        Execute a runbook
slo                     SLO health + error budget remaining
maintenance list        Upcoming maintenance windows
report weekly           Post 7-day metrics to Slack
report monthly          Post 30-day metrics to Slack
metrics                 MTTD / MTTA / MTTR breakdown
```

---

## Why Not Just Use PagerDuty?

| | This Platform | PagerDuty + Datadog + Rootly |
|--|---------|------------------------------|
| Monthly cost | $0 | ~$800–1,500 |
| AI root cause analysis | ✅ GPT-4o / Gemini | ✅ (paid add-on) |
| Custom runbooks | ✅ code-level control | ✅ |
| SLO tracking | ✅ built-in | ✅ |
| Predictive alerts | ✅ linear regression | ✅ |
| On-call schedules | ✅ | ✅ |
| Multi-agent integration | ✅ native | ❌ |
| Customizable to your stack | ✅ full source | ❌ |
| Postmortems | ✅ AI-generated | Limited |

---

## Security

All secrets are stored in per-workspace `.env` files, never in source code.

See [SECURITY.md](SECURITY.md) for the full credential inventory and rotation checklist.

---

<div align="center">

Built by **Aditya Pratap** — [GitHub](https://github.com/akkupratap323)

</div>
