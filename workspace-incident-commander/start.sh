#!/usr/bin/env bash
# ============================================================
# Incident Commander — Startup Script
# ============================================================
# Usage: ./start.sh [--setup]
#   --setup   Run DB setup + seed before starting (first-time only)

set -e

WORKSPACE="$(cd "$(dirname "$0")" && pwd)"
cd "$WORKSPACE"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "🚨 Incident Commander v2.0"
echo "================================"

# ── Preflight checks ────────────────────────────────────────

if [ ! -f ".env" ]; then
  echo -e "${RED}ERROR: .env file not found.${NC}"
  echo "  Copy .env.example → .env and fill in your credentials."
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo -e "${RED}ERROR: Node.js is not installed.${NC}"
  exit 1
fi

if ! command -v pm2 &> /dev/null; then
  echo -e "${YELLOW}PM2 not found. Installing globally...${NC}"
  npm install -g pm2
fi

if ! command -v aws &> /dev/null; then
  echo -e "${YELLOW}WARNING: AWS CLI not found. Monitoring will fail without it.${NC}"
fi

# ── Dependencies ─────────────────────────────────────────────

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# ── First-time setup ─────────────────────────────────────────

if [ "$1" = "--setup" ]; then
  echo ""
  echo "🗄️  Setting up database..."
  node scripts/setup_db.js
  node scripts/setup_db_v2.js
  echo "🌱 Seeding initial data..."
  node scripts/seed_data.js
fi

# ── Ensure logs directory ─────────────────────────────────────

mkdir -p logs

# ── Launch with PM2 ──────────────────────────────────────────

echo ""
echo "🚀 Starting all processes with PM2..."
pm2 start ecosystem.config.js

echo ""
echo -e "${GREEN}✅ Incident Commander is running!${NC}"
echo ""
echo "Processes:"
pm2 list --no-color | grep "ic-"
echo ""
echo "Commands:"
echo "  pm2 logs           — stream all logs"
echo "  pm2 logs ic-monitor — stream monitor logs only"
echo "  pm2 monit          — live dashboard"
echo "  pm2 stop all       — stop everything"
echo "  ./stop.sh          — graceful shutdown"
echo ""
