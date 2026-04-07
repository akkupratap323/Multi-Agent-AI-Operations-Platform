#!/usr/bin/env bash
# setup-github-webhooks.sh
#
# Adds a GitHub webhook to each repo listed in SQUAD.md.
# The webhook points to your relay server (exposed via ngrok/cloudflared/tailscale).
#
# Usage:
#   WEBHOOK_URL="https://your-public-url.ngrok.io/webhook" ./setup-github-webhooks.sh
#
# Prerequisites: gh CLI authenticated, jq installed

set -euo pipefail

WEBHOOK_URL="${WEBHOOK_URL:?Set WEBHOOK_URL to your public-facing relay URL}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-${WEBHOOK_SECRET_REQUIRED}}"

# Repos to configure (add yours here or parse from SQUAD.md)
REPOS=(
  "nesterlabs-ai/NesterAIBot"
  "Terrorizer-AI/opentelemetry-js"
)

EVENTS='["push","pull_request","issues","workflow_run"]'

for repo in "${REPOS[@]}"; do
  echo "Setting up webhook for $repo..."

  gh api "repos/$repo/hooks" \
    --method POST \
    -f "name=web" \
    -f "active=true" \
    --argjson events "$EVENTS" \
    -f "config[url]=$WEBHOOK_URL" \
    -f "config[content_type]=json" \
    -f "config[secret]=$WEBHOOK_SECRET" \
    -f "config[insecure_ssl]=0" \
    2>&1 && echo "  Done: $repo" || echo "  Failed: $repo (may already exist)"

  echo ""
done

echo "All webhooks configured."
echo ""
echo "To verify:"
echo "  gh api repos/OWNER/REPO/hooks --jq '.[].config.url'"
