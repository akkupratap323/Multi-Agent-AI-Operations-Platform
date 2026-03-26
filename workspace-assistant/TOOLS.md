# Personal Assistant - Available Tools

## Core Tools

### 1. Read Tool
Read files, documents, and configuration

### 2. Write Tool
Create notes, drafts, summaries

### 3. Exec Tool
Run scripts and commands

### 4. Web Tool
Fetch information from the internet

### 5. Memory Tool
Store and retrieve context

## Custom Tools

### Email Tools
- `check_inbox` - Check for new emails
- `send_email` - Send email (with approval)
- `search_emails` - Search email history
- `summarize_thread` - Summarize email conversation

### Calendar Tools
- `check_calendar` - View schedule
- `create_event` - Schedule meeting
- `update_event` - Modify meeting
- `delete_event` - Cancel meeting
- `check_availability` - Find open slots

### Task Tools
- `create_reminder` - Set reminder
- `list_tasks` - Show pending tasks
- `mark_complete` - Complete task
- `set_priority` - Update priority

### Information Tools
- `get_weather` - Current weather
- `search_web` - Web search
- `summarize_article` - Summarize URL
- `get_news` - Latest news

### Voice Tools
- `speak` - Speaks the given text aloud using the macOS system voice. Useful for reading responses, telling stories, or alerting the user audibly.

## Tool Usage Guidelines

1. **Always confirm destructive actions** (delete, cancel, send)
2. **Show drafts before sending** emails
3. **Verify dates/times** before scheduling
4. **Check permissions** before accessing data
5. **Log all actions** for audit trail

## Script Locations

```
~/.openclaw/workspace-assistant/scripts/
├── check_email.sh          # Gmail API wrapper
├── send_email.sh           # Send email via API
├── check_calendar.sh       # Calendar API wrapper
├── create_event.sh         # Schedule meeting
├── morning_briefing.sh     # Daily briefing
├── send_reminder.sh        # Meeting reminder
├── evening_summary.sh      # Day summary
└── speak.sh                # Speak text aloud
```

## Environment Variables Required

```bash
GMAIL_CREDENTIALS_PATH=~/.openclaw/gmail-credentials.json
CALENDAR_CREDENTIALS_PATH=~/.openclaw/gmail-credentials.json
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
WEATHER_API_KEY=your_weather_api_key (optional)
```

## Usage Examples

### Check Email
```bash
exec: check_inbox --limit 10 --unread-only
```

### Schedule Meeting
```bash
exec: create_event \
  --title "Team Standup" \
  --start "2026-02-17 09:00" \
  --duration 30 \
  --attendees "john@example.com,sarah@example.com"
```

### Set Reminder
```bash
exec: send_reminder \
  --message "Meeting in 30 minutes" \
  --time "2026-02-17 08:30" \
  --channel slack
```

### Morning Briefing
```bash
exec: morning_briefing.sh
```

### Speak Text Aloud
```bash
exec: ~/.openclaw/workspace-assistant/scripts/speak.sh "I have found 3 new emails that need your attention."
```

## Tool Development

To add new tools:

1. Create script in `~/.openclaw/workspace-assistant/scripts/`
2. Make executable: `chmod +x script.sh`
3. Test standalone: `./script.sh`
4. Document in this file
5. Reference in SOUL.md

## Error Handling

All tools should:
- Return non-zero exit code on failure
- Print error messages to stderr
- Log errors to gateway logs
- Provide helpful error messages

Example:
```bash
if [ $? -ne 0 ]; then
  echo "Error: Failed to check calendar" >&2
  exit 1
fi
```
