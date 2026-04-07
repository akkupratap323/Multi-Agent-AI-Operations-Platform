# TOOLS.md - Squad Brain Local Notes

## GitHub CLI (gh)

- Auth: Terrorizer-AI account (ghp token via keyring)
- Full admin scopes (repo, org, workflow, etc.)

### Useful Commands

```bash
# PRs merged in last 24h
gh pr list --repo OWNER/REPO --state merged --json number,title,author,mergedAt

# Open PRs needing review
gh pr list --repo OWNER/REPO --state open --json number,title,author,createdAt,reviewDecision

# Failed CI runs
gh run list --repo OWNER/REPO --status failure --json databaseId,name,headBranch,conclusion,createdAt

# View CI failure logs
gh run view RUN_ID --repo OWNER/REPO --log-failed

# Issues with specific labels
gh issue list --repo OWNER/REPO --label "P0,P1" --json number,title,labels,assignees

# Recent commits on main
gh api repos/OWNER/REPO/commits?sha=main&per_page=10
```

## Slack Bot API — PRIMARY DELIVERY + READ

Bot token: ``
Workspace: nesterlabs.slack.com

### Channels

| Channel | ID | Purpose |
|---------|-----|---------|
| all-nesterlabs | C08JRFE4R61 | Company announcements (general) |
| social | C08JRFE9UJ1 | Casual/fun |
| ai-and-pgi | C08JRFLQ3U5 | AI and Design (PGI) discussions |
| design-team | C08SM6DKRRA | Design collaboration |
| baithak | C09RU3LPP09 | Brainstorming / AI landscape |
| sqrx-internal | C0A67M5HVAN | SQRX project |
| alerts | C0A0VV8UTEU | Alerts |
| sentia-project | C09EQTSKPA6 | Sentia project |

### Send a message to a channel

```bash
curl -s -X POST -H "Authorization: Bearer " \
  -H "Content-Type: application/json" \
  -d '{"channel":"CHANNEL_ID","text":"YOUR MESSAGE"}' \
  https://slack.com/api/chat.postMessage
```

### Read recent messages from a channel

```bash
curl -s -H "Authorization: Bearer " \
  "https://slack.com/api/conversations.history?channel=CHANNEL_ID&limit=50"
```

### Read messages from last 24 hours (use oldest= Unix timestamp)

```bash
curl -s -H "Authorization: Bearer " \
  "https://slack.com/api/conversations.history?channel=CHANNEL_ID&limit=100&oldest=UNIX_TIMESTAMP"
```

### Look up user info by ID

```bash
curl -s -H "Authorization: Bearer " \
  "https://slack.com/api/users.info?user=USER_ID"
```

### Slack Incoming Webhook (alternative for sending)

```bash
curl -s -X POST -H 'Content-type: application/json' \
  --data '{"text":"YOUR MESSAGE HERE"}' \
  ${SLACK_WEBHOOK_URL}
```

IMPORTANT:
- The bot must be invited to a channel before it can read messages there
- To join a public channel: `curl -s -X POST -H "Authorization: Bearer xoxb-..." -d '{"channel":"CHANNEL_ID"}' https://slack.com/api/conversations.join`
- Slack uses *bold* with asterisks, _italic_ with underscores
- This is the PRIMARY way to deliver standup/changelog/alerts AND read team activity

## IFTTT Webhook — Post a Tweet (Applet B)

Post a tweet on behalf of NesterLabs via IFTTT:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"value1":"TWEET_TEXT","value2":"IMAGE_URL"}' \
  https://maker.ifttt.com/trigger/post_tweet/with/key/
```

- `value1` = the tweet text (max 280 chars) → IFTTT ingredient `{{Value1}}`
- `value2` = public image URL → IFTTT ingredient `{{Value2}}`
- If no image, send empty string for value2 or omit it
- Uses standard webhook (NOT the /json/ variant)
- Event name: `post_tweet`
- IFTTT applet uses "Post a tweet with image" action
- ALWAYS ask for user approval before posting a tweet
- After posting, confirm delivery in Slack

## WhatsApp (wacli) — SECONDARY / BACKUP

- Self-chat enabled on +918005729753
- wacli is NOT authenticated for squad-brain agent yet
- Use Slack webhook as primary delivery instead

```bash
# Send to self (Aditya) — only works if wacli auth is done
wacli send --to "+918005729753" --text "message here"
```

---

## Email & Calendar Tools (NEW!)

### Check Email Inbox

Check recent unread emails from Gmail:

```bash
node ~/.openclaw/workspace-squad-brain/scripts/check_inbox.js [limit]
# Default: 5 emails
# Example: node check_inbox.js 10
```

**Output:**
- Total unread count
- From, Subject, and Date for recent emails
- Use this when user asks: "check my inbox", "check emails", "show unread"

### Check Calendar

View upcoming events from Google Calendar:

```bash
node ~/.openclaw/workspace-squad-brain/scripts/check_calendar.js [days]
# Default: 1 day (today)
# Example: node check_calendar.js 7 (next week)
```

**Output:**
- Number of events in timeframe
- Event time, title, location, attendees
- Use this when user asks: "what's on my calendar", "any meetings today"

### Morning Briefing

Generate and send daily briefing to Slack & WhatsApp:

```bash
node ~/.openclaw/workspace-squad-brain/scripts/morning_briefing.js
```

**Output:**
- Greeting based on time of day
- Email summary (unread count + recent)
- Calendar events for today
- Daily priorities
- Sends to Slack and WhatsApp automatically

**Auto-scheduled:** Runs daily at 8:00 AM via cron

---

## How Rex Uses These Tools

**When user asks about email:**
1. Run `check_inbox.js` with appropriate limit
2. Parse the output
3. Summarize in Rex's casual voice
4. Example: "Yo, you got 201 unread. Recent ones are from ICICI Direct about market recap, Google Cloud about account upgrade, and redBus with travel offers."

**When user asks about calendar:**
1. Run `check_calendar.js` with appropriate days
2. Parse the output
3. Summarize events in friendly way
4. Example: "Calendar's looking chill today bro, no meetings scheduled."

**Commands Rex can handle:**
- "check my inbox" → `check_inbox.js 5`
- "show me 10 recent emails" → `check_inbox.js 10`
- "what's on my calendar today" → `check_calendar.js 1`
- "any meetings this week" → `check_calendar.js 7`
- "send morning briefing" → `morning_briefing.js`

**Note:** These scripts use the Assistant agent's Google OAuth credentials located at:
- Credentials: `~/.openclaw/gmail-credentials.json`
- Token: `~/.openclaw/google-token.json`

---

## Agent Bridge - Inter-Agent Communication

Communicate with other agents in the OpenClaw system:

**Available Agents:**
- `assistant` - Personal Assistant (email, calendar, briefings, automation)
- `ai-news` - AI News Agent (Twitter monitoring, content curation)
- `main` - Main Agent (general tasks, fallback)

### Send Message to Another Agent

```bash
node ~/.openclaw/shared/agent-bridge.js send <agent-id> "your message"
```

**Examples:**
```bash
# Ask Assistant to generate a briefing
node ~/.openclaw/shared/agent-bridge.js send assistant "generate morning briefing"

# Request AI news summary
node ~/.openclaw/shared/agent-bridge.js request ai-news "latest AI news for standup"

# Broadcast to all agents
node ~/.openclaw/shared/agent-bridge.js broadcast "System maintenance at 10 PM"
```

### When to Use Agent Collaboration

- **Complex email drafts** → Delegate to Assistant
- **AI news for standups** → Request from AI News agent
- **Unknown tasks** → Send to Main agent
- **Multi-agent workflows** → Coordinate between agents

### Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `send <agent-id> <msg>` | Send message to specific agent | `send assistant "draft email"` |
| `request <agent-id> <query>` | Request info from agent | `request ai-news "latest trends"` |
| `broadcast <message>` | Send to all agents | `broadcast "deployment in progress"` |
| `find <task>` | Auto-find best agent | `find "schedule meeting"` |
| `list` | Show all agents | `list` |

**Agent IDs:**
- `squad-brain` (you, Rex)
- `assistant` (Personal Assistant)
- `ai-news` (AI News)
- `main` (Main Agent)
