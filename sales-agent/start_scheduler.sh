#!/bin/bash

##
# Sales Agent Scheduler - Start Script
#
# This script starts the sales agent scheduler as a background process
##

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_FILE="$SCRIPT_DIR/logs/scheduler.log"
PID_FILE="$SCRIPT_DIR/logs/scheduler.pid"

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p $PID > /dev/null 2>&1; then
    echo "⚠️  Scheduler is already running (PID: $PID)"
    echo "   To stop: ./stop_scheduler.sh"
    exit 1
  else
    echo "⚠️  Removing stale PID file"
    rm "$PID_FILE"
  fi
fi

echo "🚀 Starting Sales Agent Scheduler..."
echo ""
echo "📝 Logs: $LOG_FILE"
echo "🔢 PID file: $PID_FILE"
echo ""

# Start scheduler in background
nohup node "$SCRIPT_DIR/scripts/scheduler.js" >> "$LOG_FILE" 2>&1 &
SCHEDULER_PID=$!

# Save PID
echo $SCHEDULER_PID > "$PID_FILE"

echo "✅ Scheduler started successfully!"
echo "   PID: $SCHEDULER_PID"
echo ""
echo "📊 Monitor logs: tail -f $LOG_FILE"
echo "🛑 Stop scheduler: ./stop_scheduler.sh"
echo "📈 View status: ./scheduler_status.sh"
echo ""
