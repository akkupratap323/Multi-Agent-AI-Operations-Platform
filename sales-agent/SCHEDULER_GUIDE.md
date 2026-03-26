# Sales Agent Scheduler - Automated Cold Email System

Run your sales agent **automatically every 5 minutes** to continuously find prospects, generate emails, and send them after approval.

## 🎯 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Every 5 Minutes (Automatic)                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Research new prospects                                  │
│     └─> Finds 25 qualified companies                        │
│                                                             │
│  2. Find contact emails                                     │
│     └─> Discovers decision maker emails                     │
│                                                             │
│  3. Generate personalized emails                            │
│     └─> Creates humanized cold emails                       │
│                                                             │
│  4. Send previews to Slack ⏸️                               │
│     └─> YOU REVIEW & APPROVE                                │
│                                                             │
│  5. Next cycle checks for approval                          │
│     └─> If approved: SENDS EMAILS ✅                        │
│     └─> If not approved: SKIPS ⏭️                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Start the Scheduler

```bash
cd /Users/apple/.openclaw/sales-agent
./start_scheduler.sh
```

**Output:**
```
🚀 Starting Sales Agent Scheduler...

📝 Logs: /Users/apple/.openclaw/sales-agent/logs/scheduler.log
🔢 PID file: /Users/apple/.openclaw/sales-agent/logs/scheduler.pid

✅ Scheduler started successfully!
   PID: 12345

📊 Monitor logs: tail -f logs/scheduler.log
🛑 Stop scheduler: ./stop_scheduler.sh
📈 View status: ./scheduler_status.sh
```

### Check Status

```bash
./scheduler_status.sh
```

**Output:**
```
╔═══════════════════════════════════════════════════════════╗
║     📊 SALES AGENT SCHEDULER - STATUS                     ║
╚═══════════════════════════════════════════════════════════╝

✅ Status: RUNNING
🔢 PID: 12345
⏰ Started: Mon Feb 17 02:30:00 2026
💾 Memory: 45.2 MB

📝 Recent Activity (last 10 lines):
[2026-02-17T02:30:00.000Z] 🚀 Starting campaign cycle
[2026-02-17T02:30:05.000Z] ✅ Research complete
[2026-02-17T02:30:15.000Z] ✅ Email finding complete
[2026-02-17T02:30:20.000Z] ✅ Email generation complete
[2026-02-17T02:30:25.000Z] 📤 Approval request sent to Slack
[2026-02-17T02:30:26.000Z] ⏰ Next cycle in 5 minutes

📈 Campaign Statistics:
   👥 Prospects researched: 25
   📧 Emails generated: 25
   ✅ Approval status: pending
   📊 Campaigns completed: 0
```

### Monitor Logs (Real-time)

```bash
tail -f logs/scheduler.log
```

### Stop the Scheduler

```bash
./stop_scheduler.sh
```

## 📋 What Happens Each Cycle

### Cycle 1 (Minute 0):
1. ✅ Research 25 new prospects
2. ✅ Find their emails
3. ✅ Generate personalized emails
4. 📤 Send email previews to Slack
5. ⏸️ **WAITS for your approval**

### Cycle 2 (Minute 5):
- Checks if you approved
- If **approved**: ✅ Sends emails
- If **not approved**: ⏭️ Skips and continues

### Cycle 3 (Minute 10):
- Starts new research cycle
- Finds different prospects
- Repeats process

## 🛡️ Safety Features

### Human Approval Required
- **Every batch** of emails requires your approval
- System **will not** send without clicking "Approve" in Slack
- You review **full email content** before sending

### Rate Limiting
- Maximum 10 emails per cycle (configurable)
- 5-second delay between sends
- Daily limit: 50 emails total

### Approval Flow
```
New Emails Generated
       ↓
   Send to Slack (5 previews)
       ↓
   Slack Message:
   ┌─────────────────────────────────┐
   │ 📧 Email 1/25 - Approval Needed │
   │                                 │
   │ Company: ProjectHub             │
   │ Subject: Quick question...      │
   │ [Full email body shown]         │
   │                                 │
   │ [✅ Approve & Send] [❌ Reject]  │
   └─────────────────────────────────┘
       ↓
   You click "✅ Approve & Send"
       ↓
   Next cycle (5 min): Sends emails
```

## ⚙️ Configuration

### Change Schedule Interval

Edit [scheduler.js](file:///Users/apple/.openclaw/sales-agent/scripts/scheduler.js):

```javascript
// Line 19-20
const SCHEDULE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_EMAILS_PER_RUN = 10; // 10 emails per cycle
```

**Options:**
- `1 * 60 * 1000` = Every 1 minute
- `5 * 60 * 1000` = Every 5 minutes (default)
- `15 * 60 * 1000` = Every 15 minutes
- `60 * 60 * 1000` = Every 1 hour

### Change Email Limit Per Run

```javascript
const MAX_EMAILS_PER_RUN = 10; // Change to 20, 30, etc.
```

### Slack Notifications

The scheduler sends updates to Slack:
- ⚙️ Cycle started
- ✅ Cycle completed (emails ready)
- 🚀 Approval granted - sending
- ✅ Emails sent (with stats)
- ❌ Errors

## 📊 Monitoring

### View Logs

```bash
# Real-time logs
tail -f logs/scheduler.log

# Last 50 lines
tail -50 logs/scheduler.log

# Search for errors
grep "ERROR" logs/scheduler.log

# Search for sent emails
grep "Emails sent" logs/scheduler.log
```

### Check Data Files

```bash
# See generated prospects
cat data/qualified_prospects.json | jq '.'

# See generated emails
cat data/generated_emails.json | jq '.'

# See campaign reports
ls -la data/campaign_report_*.json
```

### Campaign Statistics

```bash
# Latest campaign report
cat data/campaign_report_*.json | tail -1 | jq '.'
```

## 🔄 Workflow Example

### Day 1 - 2:00 PM
```
[14:00] Scheduler starts
[14:00] Cycle 1: Research → 25 prospects found
[14:01] Email previews sent to Slack
        ⏸️ Waiting for approval...
```

**You receive Slack message:**
```
📧 Email 1/25 - Approval Needed

Company: ProjectHub
Subject: Quick question about ProjectHub's customer support

[Full email shown]

[✅ Approve & Send] [❌ Reject] [✏️ Edit]
```

**You click: ✅ Approve & Send**

```
[14:05] Cycle 2: Approval detected!
[14:05] Sending 25 emails...
[14:07] ✅ 24 sent, 1 failed
[14:10] Cycle 3: New research starts...
```

### Running 24/7

The scheduler continues running:
- **Every 5 minutes**: New prospects researched
- **Every cycle**: Emails generated
- **You approve**: Emails sent
- **You don't approve**: Cycle skips to next batch

## 🎛️ Advanced Usage

### Run as System Service (macOS)

Create LaunchAgent to run on startup:

```bash
# Create service file
cat > ~/Library/LaunchAgents/com.nester.sales-agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nester.sales-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/apple/.openclaw/sales-agent/scripts/scheduler.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/apple/.openclaw/sales-agent/logs/scheduler.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/apple/.openclaw/sales-agent/logs/scheduler-error.log</string>
</dict>
</plist>
EOF

# Load service
launchctl load ~/Library/LaunchAgents/com.nester.sales-agent.plist

# Start service
launchctl start com.nester.sales-agent

# Stop service
launchctl stop com.nester.sales-agent

# Unload service
launchctl unload ~/Library/LaunchAgents/com.nester.sales-agent.plist
```

### Environment Variables

Set these before starting the scheduler:

```bash
# Email credentials
export SMTP_USER="your-email@gmail.com"
export SMTP_PASS="your-app-password"

# Email finder APIs
export HUNTER_API_KEY="your-hunter-key"
export APOLLO_API_KEY="your-apollo-key"

# Slack (already configured)
export SLACK_BOT_TOKEN="xoxb-..."
export SLACK_CHANNEL="C0AFZ4RNNM6"

# WhatsApp (optional)
export WHATSAPP_NUMBER="+91XXXXXXXXXX"

# Then start
./start_scheduler.sh
```

## 🐛 Troubleshooting

### Scheduler won't start
```bash
# Check if already running
./scheduler_status.sh

# Check logs
cat logs/scheduler.log

# Remove stale PID file
rm logs/scheduler.pid

# Try again
./start_scheduler.sh
```

### No emails being generated
```bash
# Check data directory
ls -la data/

# Check if prospects were found
cat data/qualified_prospects.json

# Check if email finder is working
node scripts/email_finder.js
```

### Approval not detected
```bash
# Check approval status
cat data/approval_status.json

# Manually approve
node scripts/approve_campaign.js approve

# Next cycle (5 min) will send emails
```

### Emails not sending
```bash
# Check SMTP credentials
echo $SMTP_USER
echo $SMTP_PASS

# Test email sender
DRY_RUN=true node scripts/email_sender.js
```

## 📝 Commands Reference

```bash
# Scheduler Management
./start_scheduler.sh          # Start scheduler
./stop_scheduler.sh           # Stop scheduler
./scheduler_status.sh         # Check status

# Manual Campaign Runs
node scripts/run_campaign.js              # Full campaign
node scripts/run_campaign.js --dry-run    # Test mode

# Approval
node scripts/approve_campaign.js approve  # Approve
node scripts/approve_campaign.js reject   # Reject

# Individual Stages
node scripts/research_prospects.js        # Research only
node scripts/email_finder.js              # Find emails only
node scripts/email_generator.js           # Generate emails only
node scripts/email_sender.js              # Send emails only

# Monitoring
tail -f logs/scheduler.log                # Watch logs
./scheduler_status.sh                     # Check status
```

## 🎯 Best Practices

1. **Start Small**: Begin with 10 emails per cycle, scale gradually
2. **Monitor Daily**: Check logs and campaign reports regularly
3. **Approve Carefully**: Always review email content before approving
4. **Track Metrics**: Monitor open rates, reply rates, unsubscribes
5. **Adjust Templates**: Update email templates based on performance
6. **Respect Limits**: Don't exceed 50-100 emails/day to avoid spam filters

## ⚠️ Important Notes

- **Approval is MANDATORY**: System will not send without explicit approval
- **Rate limiting**: Respects daily send limits automatically
- **Spam prevention**: Rotates templates, personalizes content
- **Error handling**: Continues running even if one cycle fails
- **Data persistence**: All data saved for audit trail

---

**The scheduler is now running 24/7, finding prospects and generating emails every 5 minutes!** 🚀

Check your Slack regularly to approve email batches. 📧
