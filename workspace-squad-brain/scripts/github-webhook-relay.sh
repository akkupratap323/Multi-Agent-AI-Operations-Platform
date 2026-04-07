#!/usr/bin/env bash
# github-webhook-relay.sh
#
# Lightweight webhook relay: receives GitHub webhook payloads on a local port
# and forwards relevant events to OpenClaw's /hooks/agent endpoint for Squad Brain.
#
# Usage:
#   ./github-webhook-relay.sh
#
# Requires: python3 (for the HTTP server), curl, jq
#
# For production, expose this via ngrok/cloudflared/tailscale funnel.

set -euo pipefail

RELAY_PORT="${RELAY_PORT:-9876}"
OPENCLAW_HOST="${OPENCLAW_HOST:-http://127.0.0.1:18789}"
OPENCLAW_TOKEN="${OPENCLAW_TOKEN:-${OPENCLAW_TOKEN_REQUIRED}}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-${WEBHOOK_SECRET_REQUIRED}}"

echo "Squad Brain GitHub Webhook Relay"
echo "Listening on port $RELAY_PORT"
echo "Forwarding to $OPENCLAW_HOST/hooks/agent"
echo ""

# Python HTTP server that parses GitHub payloads and forwards to OpenClaw
python3 -u << 'PYEOF'
import http.server
import json
import subprocess
import os
import sys

RELAY_PORT = int(os.environ.get("RELAY_PORT", "9876"))
OPENCLAW_HOST = os.environ.get("OPENCLAW_HOST", "http://127.0.0.1:18789")
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_TOKEN", ""))

class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        event_type = self.headers.get("X-GitHub-Event", "unknown")
        print(f"\n--- GitHub event: {event_type} ---")

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return

        # Build a concise summary for the agent
        message = self._build_message(event_type, payload)

        if message is None:
            # Event type we don't care about
            print(f"  Ignored (not relevant)")
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK (ignored)")
            return

        print(f"  Forwarding to Squad Brain: {message[:100]}...")

        # Forward to OpenClaw /hooks/agent
        forward_payload = json.dumps({
            "message": message,
            "name": f"GitHub:{event_type}",
            "sessionKey": f"hook:github:{event_type}",
            "wakeMode": "now",
            "deliver": True
        })

        try:
            result = subprocess.run([
                "curl", "-s", "-X", "POST",
                f"{OPENCLAW_HOST}/hooks/agent",
                "-H", f"x-openclaw-token: {OPENCLAW_TOKEN}",
                "-H", "Content-Type: application/json",
                "-d", forward_payload
            ], capture_output=True, text=True, timeout=10)
            print(f"  OpenClaw response: {result.stdout[:200]}")
        except Exception as e:
            print(f"  Error forwarding: {e}")

        self.send_response(202)
        self.end_headers()
        self.wfile.write(b"Accepted")

    def _build_message(self, event_type, payload):
        """Build a concise message for Squad Brain based on GitHub event type."""

        if event_type == "workflow_run":
            action = payload.get("action", "")
            wf = payload.get("workflow_run", {})
            conclusion = wf.get("conclusion", "")
            name = wf.get("name", "unknown")
            branch = wf.get("head_branch", "unknown")
            repo = payload.get("repository", {}).get("full_name", "unknown")
            sha = wf.get("head_sha", "")[:7]
            actor = wf.get("actor", {}).get("login", "unknown")

            if action == "completed" and conclusion == "failure":
                return (
                    f"GITHUB WEBHOOK: CI FAILURE\n"
                    f"Repo: {repo}\n"
                    f"Workflow: {name}\n"
                    f"Branch: {branch}\n"
                    f"Commit: {sha} by {actor}\n"
                    f"Conclusion: {conclusion}\n"
                    f"Action needed: Check logs with `gh run view` and alert if on main/prod branch."
                )
            elif action == "completed" and conclusion == "success":
                return None  # Don't alert on success
            return None

        elif event_type == "pull_request":
            action = payload.get("action", "")
            pr = payload.get("pull_request", {})
            number = pr.get("number", 0)
            title = pr.get("title", "")
            author = pr.get("user", {}).get("login", "unknown")
            repo = payload.get("repository", {}).get("full_name", "unknown")
            additions = pr.get("additions", 0)
            deletions = pr.get("deletions", 0)
            labels = [l.get("name", "") for l in pr.get("labels", [])]

            if action in ("opened", "reopened"):
                return (
                    f"GITHUB WEBHOOK: PR OPENED\n"
                    f"Repo: {repo}\n"
                    f"PR #{number}: {title}\n"
                    f"Author: {author}\n"
                    f"Changes: +{additions} -{deletions}\n"
                    f"Labels: {', '.join(labels) or 'none'}\n"
                    f"Decide if this is urgent for today. If >500 lines or has P0/P1/security label, alert."
                )
            elif action == "closed" and pr.get("merged"):
                return (
                    f"GITHUB WEBHOOK: PR MERGED\n"
                    f"Repo: {repo}\n"
                    f"PR #{number}: {title}\n"
                    f"Author: {author}\n"
                    f"Log this for the evening changelog. No alert needed unless it's a revert."
                )
            return None

        elif event_type == "issues":
            action = payload.get("action", "")
            issue = payload.get("issue", {})
            number = issue.get("number", 0)
            title = issue.get("title", "")
            author = issue.get("user", {}).get("login", "unknown")
            repo = payload.get("repository", {}).get("full_name", "unknown")
            labels = [l.get("name", "") for l in issue.get("labels", [])]

            if action in ("opened", "labeled"):
                priority_labels = [l for l in labels if l.lower() in ("p0", "p1", "blocker", "security", "critical")]
                if priority_labels or action == "opened":
                    return (
                        f"GITHUB WEBHOOK: ISSUE {'OPENED' if action == 'opened' else 'LABELED'}\n"
                        f"Repo: {repo}\n"
                        f"Issue #{number}: {title}\n"
                        f"Author: {author}\n"
                        f"Labels: {', '.join(labels) or 'none'}\n"
                        f"Priority labels: {', '.join(priority_labels) or 'none'}\n"
                        f"If P0/P1/blocker/security, alert immediately. Otherwise log for standup."
                    )
            return None

        elif event_type == "push":
            repo = payload.get("repository", {}).get("full_name", "unknown")
            ref = payload.get("ref", "")
            branch = ref.split("/")[-1] if "/" in ref else ref
            pusher = payload.get("pusher", {}).get("name", "unknown")
            commits = payload.get("commits", [])

            # Only care about pushes to main/master/prod
            if branch in ("main", "master", "production", "prod"):
                commit_msgs = [c.get("message", "").split("\n")[0] for c in commits[:5]]
                return (
                    f"GITHUB WEBHOOK: PUSH TO {branch.upper()}\n"
                    f"Repo: {repo}\n"
                    f"Pusher: {pusher}\n"
                    f"Commits ({len(commits)}):\n"
                    + "\n".join(f"  - {m}" for m in commit_msgs) + "\n"
                    f"Log for changelog. Watch for CI results."
                )
            return None

        return None

    def log_message(self, format, *args):
        # Quieter logging
        pass

server = http.server.HTTPServer(("0.0.0.0", RELAY_PORT), WebhookHandler)
print(f"Webhook relay server running on port {RELAY_PORT}")
server.serve_forever()
PYEOF
