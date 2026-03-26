#!/bin/bash

# Morning Briefing to Slack
# Sends daily summary to Slack channel

BRIEFING=$(node ~/.openclaw/workspace-assistant/scripts/morning_briefing.js 2>&1 | sed -n '/Generated briefing:/,/==================/p' | sed '1d;$d')

# Send to Slack using Rex
openclaw agent --agent squad-brain --message "Send this morning briefing to Slack:

$BRIEFING"

echo "✅ Briefing sent via Rex to Slack"
