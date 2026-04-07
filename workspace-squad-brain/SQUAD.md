# SQUAD.md - Team & Repos Configuration

## Team Members

| Name | GitHub Username | Role | Focus |
|------|----------------|------|-------|
| Aditya Pratap Singh | Terrorizer-AI | Lead / Founder | Pipecat, emotion detection, interruption logic, agent infra |
| Shrey Malik | - | Team Member | - |
| Asha Theres | - | Team Member | - |
| Abhijith M | abhijith-nest | DevOps/Infra | AWS CDK, CI/CD, CloudWatch, Graviton deploy |
| Susaant K | - | Team Member | - |
| Sneha R.K. | - | Team Member | - |
| Ankur Richhariya | - | Team Member | - |
| Lohita Suvvari | - | Team Member | - |
| Kunal Shrivastava | kunal-nest | Backend Lead | RAG service, AI prompt, KG graphs, backend |
| Gaurav Gupta | - | Team Member | - |
| Ayush Raj | ayushnesterlabs | Collaborator | - |
| John Horo | JohnNesterLabs | Frontend | UI (cards, widgets, responsive, CSS, subtitles) |

## Repos to Track

### Primary (high activity — track everything)
- `nesterlabs-ai/NesterAIBot` — Main product repo (voice AI bot with pipecat, RAG, A2UI)

### Secondary (lower activity — include in standup if changes)
- `Terrorizer-AI/opentelemetry-js` — OpenTelemetry fork

## What To Track Per Repo

For `nesterlabs-ai/NesterAIBot`:
- **PRs**: ALL opened, merged, review-requested. Flag if >500 lines or stale >24h
- **CI**: "Deploy to AWS" and "Deploy to AWS Graviton" workflows — alert on ANY failure
- **Issues**: Track open issues. Track new ones and label-based priority
- **Branches to watch**: main, fix/widgets, graviton-test, feat/* branches
- **Deploy awareness**: Every "Deploy to AWS" run = production deployment. Flag failures immediately.

## Current State (auto-updated by Rex)

### Open PRs (as of last update)
- PR #36 (Aditya): "Upgrade pipecat 0.0.100" — open since Feb 11
- PR #35 (Aditya): "fix: resolve post-merge crashes and enable barge-in" — open since Feb 11
- PR #32 (John): "Feat/cards" — open since Feb 11

### Recent Activity Patterns
- John: Very active on fix/widgets branch, multiple deploys daily
- Abhijith: Graviton deploy testing, infra work
- Kunal: Backend/RAG updates, AI prompt tuning
- Aditya: Pipecat upgrades, emotion detection, interruption handling

## Delivery Target

- **Primary:** Slack (Bot API or webhook — see TOOLS.md)
- **Method:** Post to relevant Slack channels

## Labels That Matter

- `P0` — Critical, alert immediately
- `P1` — High priority, include in standup
- `blocker` — Include in standup, flag as risk
- `security` — Always alert
- `bug` — Track in standup if on main branch

## Special Notes

- This is a voice AI bot product (pipecat framework + RAG + emotion detection)
- Deploys go to AWS (ECS/Graviton). CI = "Deploy to AWS" workflow
- The team uses no PR labels currently — Rex should infer priority from:
  - Branch name (fix/ = bugfix, feat/ = feature)
  - Files changed (infrastructure changes = high priority)
  - Whether it touches main/production deployment paths
