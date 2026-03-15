# TOOLS.md - Incident Commander

## Pipeline Scripts

All scripts are in `scripts/` directory. Run with `node scripts/<name>.js`.

| Script | Stage | Purpose |
|--------|-------|---------|
| `monitor.js` | 1 | Poll AWS CloudWatch, detect anomalies |
| `diagnose.js` | 2 | Gather context, LLM root cause analysis |
| `respond.js` | 3 | Create Slack war room, notify all channels |
| `resolve.js` | 4 | Post fixes, poll approval, execute, health check |
| `postmortem.js` | 5 | Generate report, calculate MTTR |
| `incident_pipeline.js` | 2-5 | Orchestrator: chains all stages |
| `health_check.js` | - | Post-fix metric validation |
| `setup_db.js` | - | One-time DB table creation |

## Utility Modules (scripts/utils/)

| Module | Purpose |
|--------|---------|
| `cloudwatch.js` | AWS CLI wrappers for metrics and logs |
| `slack.js` | Slack API: post, create channel, poll approval |
| `whatsapp.js` | WhatsApp alert delivery |
| `email.js` | Gmail API delivery via OAuth |
| `db.js` | Neon PostgreSQL client for incidents |
| `llm.js` | Gemini API for diagnosis and postmortem |

## AWS CLI Commands (via cloudwatch.js)

```bash
# EC2 metrics
aws cloudwatch get-metric-statistics --region us-west-2 \
  --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-xxx \
  --start-time X --end-time Y --period 300 --statistics Average

# ECS metrics
aws cloudwatch get-metric-statistics --region us-west-2 \
  --namespace AWS/ECS --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=X Name=ServiceName,Value=Y ...

# Lambda metrics
aws cloudwatch get-metric-statistics --region us-west-2 \
  --namespace AWS/Lambda --metric-name Errors \
  --dimensions Name=FunctionName,Value=X ...

# CloudWatch Logs
aws logs filter-log-events --region us-west-2 \
  --log-group-name /ecs/service-name \
  --start-time X --filter-pattern "ERROR" --limit 50

# Resource discovery
aws ec2 describe-instances --region us-west-2 --filters "Name=instance-state-name,Values=running"
aws rds describe-db-instances --region us-west-2
aws lambda list-functions --region us-west-2
aws ecs list-clusters --region us-west-2
aws elbv2 describe-load-balancers --region us-west-2
```

## Slack API
- Bot Token: ``
- Incidents Channel: Created on first run as `#incidents`
- War Room Pattern: `#incident-YYYY-MM-DD-NNN`

## Database
- Neon PostgreSQL (Ultron project)
- Tables: `incidents`, `incident_timeline`
- Connection via `utils/db.js`

## Gemini LLM
- Model: `gemini-2.5-flash`
- Used only for: root cause diagnosis, postmortem generation
- API: `generativelanguage.googleapis.com/v1beta/models/`
