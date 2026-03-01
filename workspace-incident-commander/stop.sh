#!/usr/bin/env bash
# Gracefully stop all Incident Commander processes
cd "$(dirname "$0")"
echo "🛑 Stopping Incident Commander..."
pm2 stop ecosystem.config.js 2>/dev/null || pm2 stop all 2>/dev/null || true
echo "✅ Stopped."
