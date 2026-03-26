#!/bin/bash

##
# Sales Agent Scheduler - Status Check
##

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/logs/scheduler.pid"
LOG_FILE="$SCRIPT_DIR/logs/scheduler.log"

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║              📊 SALES AGENT SCHEDULER - STATUS                            ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")

  if ps -p $PID > /dev/null 2>&1; then
    echo "✅ Status: RUNNING"
    echo "🔢 PID: $PID"

    # Get uptime
    START_TIME=$(ps -p $PID -o lstart=)
    echo "⏰ Started: $START_TIME"

    # Get memory usage
    MEM=$(ps -p $PID -o rss= | awk '{print $1/1024 " MB"}')
    echo "💾 Memory: $MEM"

  else
    echo "❌ Status: NOT RUNNING (stale PID file)"
    echo "   Run: ./start_scheduler.sh"
  fi
else
  echo "❌ Status: NOT RUNNING"
  echo "   Run: ./start_scheduler.sh"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show recent activity
if [ -f "$LOG_FILE" ]; then
  echo "📝 Recent Activity (last 10 lines):"
  echo ""
  tail -10 "$LOG_FILE"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📊 Full logs: tail -f $LOG_FILE"
else
  echo "⚠️  No log file found"
fi

# Show campaign statistics
DATA_DIR="$SCRIPT_DIR/data"
if [ -d "$DATA_DIR" ]; then
  echo ""
  echo "📈 Campaign Statistics:"
  echo ""

  if [ -f "$DATA_DIR/qualified_prospects.json" ]; then
    PROSPECT_COUNT=$(jq '. | length' "$DATA_DIR/qualified_prospects.json" 2>/dev/null || echo "0")
    echo "   👥 Prospects researched: $PROSPECT_COUNT"
  fi

  if [ -f "$DATA_DIR/generated_emails.json" ]; then
    EMAIL_COUNT=$(jq '. | length' "$DATA_DIR/generated_emails.json" 2>/dev/null || echo "0")
    echo "   📧 Emails generated: $EMAIL_COUNT"
  fi

  if [ -f "$DATA_DIR/approval_status.json" ]; then
    APPROVAL_STATUS=$(jq -r '.status' "$DATA_DIR/approval_status.json" 2>/dev/null || echo "unknown")
    echo "   ✅ Approval status: $APPROVAL_STATUS"
  fi

  # Count campaign reports
  REPORT_COUNT=$(find "$DATA_DIR" -name "campaign_report_*.json" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$REPORT_COUNT" -gt 0 ]; then
    echo "   📊 Campaigns completed: $REPORT_COUNT"

    # Show latest campaign stats
    LATEST_REPORT=$(find "$DATA_DIR" -name "campaign_report_*.json" | sort -r | head -1)
    if [ -f "$LATEST_REPORT" ]; then
      SENT=$(jq -r '.totalSent' "$LATEST_REPORT" 2>/dev/null || echo "0")
      FAILED=$(jq -r '.totalFailed' "$LATEST_REPORT" 2>/dev/null || echo "0")
      echo "   📤 Last campaign: $SENT sent, $FAILED failed"
    fi
  fi
fi

echo ""
