#!/bin/bash

# Demo: Agent Collaboration Workflow
# This demonstrates how agents communicate with each other

echo "🤝 OpenClaw Agent Collaboration Demo"
echo "===================================="
echo ""

echo "📋 Available Agents:"
node ~/.openclaw/shared/agent-bridge.js list
echo ""

echo "🔍 Testing Agent Routing..."
echo ""

echo "Task: 'check my inbox'"
node ~/.openclaw/shared/agent-bridge.js find "check my inbox"
echo ""

echo "Task: 'find latest AI news'"
node ~/.openclaw/shared/agent-bridge.js find "find latest AI news"
echo ""

echo "Task: 'schedule a meeting'"
node ~/.openclaw/shared/agent-bridge.js find "schedule a meeting"
echo ""

echo "Task: 'post to twitter'"
node ~/.openclaw/shared/agent-bridge.js find "post to twitter"
echo ""

echo "✅ Agent routing is working!"
echo ""
echo "📤 Example: Send message from Rex to Assistant"
echo "Command: node agent-bridge.js send assistant 'generate morning briefing'"
echo ""
echo "📥 Example: Request info from AI News"
echo "Command: node agent-bridge.js request ai-news 'latest AI developments'"
echo ""
echo "📣 Example: Broadcast to all agents"
echo "Command: node agent-bridge.js broadcast 'System update complete'"
echo ""

echo "🎯 How Agents Collaborate:"
echo ""
echo "1. User asks Rex (via Slack): 'send morning briefing'"
echo "   └─> Rex delegates to Assistant: 'generate briefing'"
echo "       └─> Assistant generates and sends back via agent-bridge"
echo "           └─> Rex posts to Slack"
echo ""
echo "2. User asks Rex: 'what's trending in AI?'"
echo "   └─> Rex requests from AI News: 'latest AI trends'"
echo "       └─> AI News provides curated news"
echo "           └─> Rex summarizes in his casual voice"
echo ""
echo "3. Morning briefing auto-runs at 8 AM"
echo "   └─> Assistant generates briefing with calendar/email"
echo "       └─> Requests AI news from ai-news agent"
echo "           └─> Sends complete briefing to Rex"
echo "               └─> Rex posts to Slack and WhatsApp"
echo ""

echo "🚀 Your multi-agent system is ready!"
