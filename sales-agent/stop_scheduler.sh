#!/bin/bash

##
# Sales Agent Scheduler - Stop Script
##

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/logs/scheduler.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "⚠️  Scheduler is not running (no PID file found)"
  exit 1
fi

PID=$(cat "$PID_FILE")

if ! ps -p $PID > /dev/null 2>&1; then
  echo "⚠️  Scheduler is not running (process not found)"
  rm "$PID_FILE"
  exit 1
fi

echo "🛑 Stopping Sales Agent Scheduler (PID: $PID)..."

# Send SIGTERM for graceful shutdown
kill -TERM $PID

# Wait for process to stop
sleep 2

# Check if stopped
if ps -p $PID > /dev/null 2>&1; then
  echo "⚠️  Process still running, forcing stop..."
  kill -9 $PID
  sleep 1
fi

# Remove PID file
rm "$PID_FILE"

echo "✅ Scheduler stopped successfully"
