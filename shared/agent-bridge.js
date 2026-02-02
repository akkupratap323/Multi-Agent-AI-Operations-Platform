#!/usr/bin/env node

/**
 * Agent Bridge - Inter-Agent Communication System
 * Allows agents to send messages to each other
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AGENTS = {
  'main': {
    id: 'main',
    name: 'Main Agent',
    capabilities: ['general', 'fallback']
  },
  'rex': {
    id: 'squad-brain',
    name: 'Rex',
    capabilities: ['slack', 'whatsapp', 'chat', 'email', 'calendar', 'tweets']
  },
  'ai-news': {
    id: 'ai-news',
    name: 'AI News',
    capabilities: ['twitter', 'news-monitoring', 'content-curation']
  },
  'assistant': {
    id: 'assistant',
    name: 'Personal Assistant',
    capabilities: ['email', 'calendar', 'briefings', 'automation']
  },
  'dev-monitor': {
    id: 'dev-monitor',
    name: 'Dev Monitor',
    capabilities: ['github', 'ci-cd', 'pr-tracking', 'build-alerts', 'dev-reports']
  },
  'incident-commander': {
    id: 'incident-commander',
    name: 'Incident Commander',
    capabilities: ['aws-monitoring', 'incident-management', 'auto-remediation', 'postmortem', 'cloudwatch']
  }
};

/**
 * Send message to another agent
 */
function sendToAgent(toAgentId, message, options = {}) {
  try {
    const agent = Object.values(AGENTS).find(a => a.id === toAgentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${toAgentId}`);
    }

    console.log(`📤 Sending to ${agent.name}...`);

    const escapedMessage = message.replace(/'/g, "'\\''");
    const cmd = `openclaw agent --agent ${toAgentId} --message '${escapedMessage}'`;

    const result = execSync(cmd, {
      encoding: 'utf8',
      timeout: options.timeout || 30000,
      stdio: 'pipe'
    });

    console.log(`✅ Sent to ${agent.name}`);
    return { success: true, response: result, agent: agent.name };

  } catch (error) {
    console.error(`❌ Failed to send to ${toAgentId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Broadcast message to all agents
 */
function broadcast(message, options = {}) {
  const excludeAgents = options.exclude || [];
  const results = {};

  console.log(`📣 Broadcasting to all agents...`);

  for (const [key, agent] of Object.entries(AGENTS)) {
    if (excludeAgents.includes(agent.id)) {
      console.log(`⏭️  Skipping ${agent.name}`);
      continue;
    }

    results[agent.id] = sendToAgent(agent.id, message, options);
  }

  return results;
}

/**
 * Request information from an agent
 */
function requestFromAgent(fromAgentId, query) {
  const agent = Object.values(AGENTS).find(a => a.id === fromAgentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${fromAgentId}`);
  }

  console.log(`📥 Requesting from ${agent.name}: "${query}"`);
  return sendToAgent(fromAgentId, query);
}

/**
 * Get agent capabilities
 */
function getAgentCapabilities(agentId) {
  const agent = Object.values(AGENTS).find(a => a.id === agentId);
  return agent ? agent.capabilities : [];
}

/**
 * Find best agent for a task
 */
function findAgentForTask(task) {
  const taskLower = task.toLowerCase();

  // Email/Calendar tasks
  if (taskLower.includes('email') || taskLower.includes('inbox') ||
      taskLower.includes('calendar') || taskLower.includes('meeting')) {
    return 'squad-brain'; // Rex has access via symlinks
  }

  // Twitter/News tasks
  if (taskLower.includes('tweet') || taskLower.includes('twitter') ||
      taskLower.includes('news') || taskLower.includes('ai news')) {
    return 'ai-news';
  }

  // Chat/Communication tasks
  if (taskLower.includes('slack') || taskLower.includes('whatsapp') ||
      taskLower.includes('message')) {
    return 'squad-brain';
  }

  // Default to Rex for general tasks
  return 'squad-brain';
}

/**
 * Agent collaboration - multiple agents work together
 */
async function collaborate(task, agents = []) {
  console.log(`🤝 Collaboration requested: "${task}"`);

  if (agents.length === 0) {
    // Auto-select relevant agents
    agents = ['squad-brain', 'assistant', 'ai-news'];
  }

  const results = {};

  for (const agentId of agents) {
    console.log(`\n📌 Asking ${agentId}...`);
    results[agentId] = sendToAgent(agentId, task);
  }

  return results;
}

/**
 * Store agent message in shared memory
 */
function storeMessage(fromAgent, toAgent, message) {
  const logDir = path.join(process.env.HOME, '.openclaw', 'shared', 'messages');

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    from: fromAgent,
    to: toAgent,
    message: message.substring(0, 200) // Store first 200 chars
  };

  const logFile = path.join(logDir, 'agent-messages.jsonl');
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

/**
 * CLI Interface
 */
if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'send':
      const toAgent = args[0];
      const message = args.slice(1).join(' ');
      const result = sendToAgent(toAgent, message);
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'broadcast':
      const broadcastMsg = args.join(' ');
      const broadcastResult = broadcast(broadcastMsg);
      console.log(JSON.stringify(broadcastResult, null, 2));
      break;

    case 'request':
      const requestAgent = args[0];
      const requestQuery = args.slice(1).join(' ');
      const requestResult = requestFromAgent(requestAgent, requestQuery);
      console.log(JSON.stringify(requestResult, null, 2));
      break;

    case 'find':
      const task = args.join(' ');
      const bestAgent = findAgentForTask(task);
      console.log(`Best agent for "${task}": ${bestAgent}`);
      break;

    case 'list':
      console.log('Available Agents:\n');
      Object.entries(AGENTS).forEach(([key, agent]) => {
        console.log(`${agent.name} (${agent.id})`);
        console.log(`  Capabilities: ${agent.capabilities.join(', ')}`);
        console.log('');
      });
      break;

    default:
      console.log(`
Agent Bridge - Inter-Agent Communication

Usage:
  node agent-bridge.js send <agent-id> <message>
  node agent-bridge.js broadcast <message>
  node agent-bridge.js request <agent-id> <query>
  node agent-bridge.js find <task-description>
  node agent-bridge.js list

Examples:
  node agent-bridge.js send squad-brain "check my inbox"
  node agent-bridge.js broadcast "System update complete"
  node agent-bridge.js request assistant "what's on calendar"
  node agent-bridge.js find "schedule a meeting"
  node agent-bridge.js list

Available Agents:
  - main: Main Agent
  - squad-brain: Rex (Slack, WhatsApp, Email, Calendar)
  - ai-news: AI News Agent (Twitter monitoring)
  - assistant: Personal Assistant (Email, Calendar backend)
      `);
  }
}

module.exports = {
  sendToAgent,
  broadcast,
  requestFromAgent,
  getAgentCapabilities,
  findAgentForTask,
  collaborate,
  storeMessage,
  AGENTS
};
