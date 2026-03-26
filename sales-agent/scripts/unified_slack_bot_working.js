#!/usr/bin/env node

/**
 * Unified Slack Bot - Central Hub for All Agents
 *
 * This bot connects to:
 * 1. Sales Agent - Cold email campaigns
 * 2. Database Monitor - User signup alerts
 * 3. Terrorizer AI - General chat/assistance
 * 4. Other future agents
 *
 * Routes requests to the right agent based on intent
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';

// Agent configurations
const AGENTS = {
  sales: {
    name: 'Sales Agent',
    keywords: ['sales', 'email', 'campaign', 'prospect', 'cold email', 'approve', 'reject'],
    description: 'Handles cold email campaigns and prospect research'
  },
  database: {
    name: 'Database Monitor',
    keywords: ['database', 'users', 'signups', 'monitor', 'ultron', 'user', 'new users', 'tracking', 'check users', 'show users', 'recent users'],
    description: 'Monitors database for new user signups'
  },
  general: {
    name: 'Terrorizer AI',
    keywords: ['hello', 'hi', 'help', 'what', 'how', 'why'],
    description: 'General assistance and chat'
  }
};

// Start checking from 1 minute ago to catch recent messages
let lastCheckedTime = (Date.now() / 1000) - 60;

/**
 * Get email count from generated emails file
 */
function getEmailCount() {
  const emailsFile = '/Users/apple/.openclaw/sales-agent/data/generated_emails.json';
  if (fs.existsSync(emailsFile)) {
    const emails = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));
    return emails.length;
  }
  return 0;
}

/**
 * Determine which agent should handle the message
 */
function routeToAgent(message) {
  const text = message.toLowerCase();

  // Check for sales agent keywords
  for (const keyword of AGENTS.sales.keywords) {
    if (text.includes(keyword)) {
      return 'sales';
    }
  }

  // Check for database keywords
  for (const keyword of AGENTS.database.keywords) {
    if (text.includes(keyword)) {
      return 'database';
    }
  }

  // Default to general chat
  return 'general';
}

/**
 * Handle sales agent requests
 */
async function handleSalesAgent(message, threadTs) {
  const text = message.toLowerCase().trim();

  // Approval/rejection - exact match or contains the word
  if (text === 'approve' || text === 'yes' || text === 'send' || text.includes('i approve')) {
    const { execSync } = require('child_process');

    try {
      execSync('node /Users/apple/.openclaw/sales-agent/scripts/approve_campaign.js approve');
      await sendToSlack(
        `✅ *Sales Campaign APPROVED!*\n\n` +
        `The scheduler will send ${getEmailCount()} emails in the next cycle (within 5 minutes).\n\n` +
        `You'll receive a confirmation when emails are sent.`,
        threadTs
      );
      return true;
    } catch (error) {
      await sendToSlack(
        `⚠️ No pending campaign to approve. Type \`start campaign\` to begin.`,
        threadTs
      );
      return true;
    }
  }

  if (text === 'reject' || text === 'no' || text === 'cancel' || text.includes('i reject')) {
    const { execSync } = require('child_process');

    try {
      execSync('node /Users/apple/.openclaw/sales-agent/scripts/approve_campaign.js reject');
      await sendToSlack(
        `❌ *Sales Campaign REJECTED*\n\nNo emails will be sent.`,
        threadTs
      );
      return true;
    } catch (error) {
      await sendToSlack(
        `⚠️ No pending campaign to reject.`,
        threadTs
      );
      return true;
    }
  }

  // Status check
  if (text.includes('status') || text.includes('campaign')) {
    const approvalFile = '/Users/apple/.openclaw/sales-agent/data/approval_status.json';

    if (fs.existsSync(approvalFile)) {
      const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
      return await sendToSlack(
        `📊 *Sales Campaign Status*\n\n` +
        `• Status: ${approval.status}\n` +
        `• Emails ready: ${approval.emailCount || 'unknown'}\n` +
        `• Requested: ${new Date(approval.requestedAt).toLocaleString()}`,
        threadTs
      );
    } else {
      return await sendToSlack(
        `📊 *Sales Campaign Status*\n\nNo pending campaigns.`,
        threadTs
      );
    }
  }

  // Start new campaign - run the full flow
  if (text.includes('start') || text.includes('new campaign') || text.includes('begin')) {
    await sendToSlack(
      `🚀 *Starting New Sales Campaign...*\n\n` +
      `This will:\n` +
      `1. Research 25 new prospects\n` +
      `2. Find their emails\n` +
      `3. Generate personalized cold emails\n` +
      `4. Show you previews for approval\n\n` +
      `Please wait 30-60 seconds...`,
      threadTs
    );

    // Run the campaign pipeline
    const { execSync } = require('child_process');

    try {
      // Step 1: Research
      await sendToSlack(`⏳ Step 1/4: Researching prospects...`, threadTs);
      execSync('node /Users/apple/.openclaw/sales-agent/scripts/research_prospects.js', { stdio: 'pipe' });

      // Step 2: Find emails
      await sendToSlack(`⏳ Step 2/4: Finding emails...`, threadTs);
      execSync('node /Users/apple/.openclaw/sales-agent/scripts/email_finder.js', { stdio: 'pipe' });

      // Step 3: Generate emails
      await sendToSlack(`⏳ Step 3/4: Generating personalized emails...`, threadTs);
      execSync('node /Users/apple/.openclaw/sales-agent/scripts/email_generator.js', { stdio: 'pipe' });

      // Step 4: Show previews
      await sendToSlack(`⏳ Step 4/4: Preparing email previews...`, threadTs);

      // Load and show first 3 emails
      const emailsFile = '/Users/apple/.openclaw/sales-agent/data/generated_emails.json';
      const emails = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));

      await sendToSlack(`\n📧 *Campaign Ready! Here are 3 sample emails:*\n`, threadTs);

      for (let i = 0; i < Math.min(3, emails.length); i++) {
        const email = emails[i];
        const preview = `📧 *Email ${i + 1}/${emails.length}*\n\n` +
          `*To:* ${email.to}\n` +
          `*Company:* ${email.prospect.companyName}\n` +
          `*Subject:* ${email.subject}\n\n` +
          `*Body:*\n\`\`\`${email.body.substring(0, 400)}...\`\`\``;

        await sendToSlack(preview, threadTs);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Create approval status
      fs.writeFileSync('/Users/apple/.openclaw/sales-agent/data/approval_status.json', JSON.stringify({
        status: 'pending',
        requestedAt: new Date().toISOString(),
        emailCount: emails.length
      }, null, 2));

      // Ask for approval
      await sendToSlack(
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🚀 *Ready to Send ${emails.length} Emails!*\n\n` +
        `✅ Type \`approve\` to SEND emails\n` +
        `❌ Type \`reject\` to CANCEL\n\n` +
        `Full preview: \`/Users/apple/.openclaw/sales-agent/data/emails_readable.txt\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        threadTs
      );

      return true;
    } catch (error) {
      await sendToSlack(
        `❌ *Campaign Failed*\n\nError: ${error.message}\n\nPlease check the logs.`,
        threadTs
      );
      return true;
    }
  }

  // General sales help
  return await sendToSlack(
    `💼 *Sales Agent Commands:*\n\n` +
    `• \`approve\` - Approve pending email campaign\n` +
    `• \`reject\` - Reject pending campaign\n` +
    `• \`status\` - Check campaign status\n` +
    `• \`start new campaign\` - Begin new outreach\n\n` +
    `What would you like to do?`,
    threadTs
  );
}

/**
 * Handle database monitor requests
 */
async function handleDatabaseAgent(message, threadTs) {
  const text = message.toLowerCase();

  if (text.includes('check') || text.includes('users') || text.includes('signups') || text.includes('database')) {
    await sendToSlack(
      `🔍 *Checking Ultron Database...*\n\nLet me check for recent user signups...`,
      threadTs
    );

    // Call the database discovery script
    const { execSync } = require('child_process');

    try {
      const output = execSync('node /Users/apple/.openclaw/workspace-dev-monitor/scripts/discover_users_table.js', {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024
      });

      // Parse output to extract user info
      const lines = output.split('\n');
      const totalUsersMatch = output.match(/Total Users: (\d+)/);
      const totalUsers = totalUsersMatch ? totalUsersMatch[1] : 'unknown';

      // Extract most recent user info
      const userInfoStart = output.indexOf('Most Recent User:');
      if (userInfoStart !== -1) {
        const userSection = output.substring(userInfoStart);
        const idMatch = userSection.match(/id: ([^\n]+)/);
        const usernameMatch = userSection.match(/username: ([^\n]+)/);
        const displayNameMatch = userSection.match(/displayName: ([^\n]+)/);
        const emailMatch = userSection.match(/email: ([^\n]+)/);
        const createdAtMatch = userSection.match(/createdAt: "([^"]+)"/);

        const recentUser = {
          id: idMatch ? idMatch[1] : 'N/A',
          username: usernameMatch ? usernameMatch[1] : 'N/A',
          displayName: displayNameMatch ? displayNameMatch[1] : 'N/A',
          email: emailMatch ? emailMatch[1] : 'N/A',
          createdAt: createdAtMatch ? new Date(createdAtMatch[1]).toLocaleString() : 'N/A'
        };

        console.log('Sending database response to Slack...');
        const sent = await sendToSlack(
          `✅ *Ultron Database Status*\n\n` +
          `📊 *Total Users:* ${totalUsers}\n\n` +
          `👤 *Most Recent Signup:*\n` +
          `• Name: ${recentUser.displayName}\n` +
          `• Username: ${recentUser.username}\n` +
          `• Email: ${recentUser.email}\n` +
          `• Joined: ${recentUser.createdAt}\n` +
          `• ID: ${recentUser.id}`,
          threadTs
        );
        console.log('Database response sent:', sent);
      } else {
        await sendToSlack(
          `✅ *Ultron Database Status*\n\n` +
          `📊 *Total Users:* ${totalUsers}\n\n` +
          `No recent user data available.`,
          threadTs
        );
      }

      return true;
    } catch (error) {
      await sendToSlack(
        `❌ *Database Check Failed*\n\n` +
        `Error: ${error.message}\n\n` +
        `Please check database connection.`,
        threadTs
      );
      return true;
    }
  }

  return await sendToSlack(
    `📊 *Database Monitor Commands:*\n\n` +
    `• \`check users\` - Check recent signups\n` +
    `• \`show new users\` - See latest signups\n` +
    `• \`database status\` - Monitor status\n\n` +
    `What would you like to check?`,
    threadTs
  );
}

/**
 * Handle general chat (Terrorizer AI)
 */
async function handleGeneralChat(message, threadTs) {
  const text = message.toLowerCase();

  if (text === 'hello' || text === 'hi') {
    return await sendToSlack(
      `👋 *Hello! I'm your Nester Labs AI Assistant*\n\n` +
      `I can help with:\n\n` +
      `💼 *Sales Agent*\n` +
      `• Cold email campaigns\n` +
      `• Prospect research\n` +
      `• Email approvals\n\n` +
      `📊 *Database Monitor*\n` +
      `• User signup tracking\n` +
      `• Database alerts\n\n` +
      `💬 *General Help*\n` +
      `• Answer questions\n` +
      `• Assist with tasks\n\n` +
      `What can I help you with today?`,
      threadTs
    );
  }

  if (text === 'help') {
    return await sendToSlack(
      `🤖 *Nester Labs AI - Available Commands*\n\n` +
      `*Sales:*\n` +
      `• \`sales status\` - Check campaign status\n` +
      `• \`approve\` - Approve email campaign\n` +
      `• \`start new campaign\` - Begin outreach\n\n` +
      `*Database:*\n` +
      `• \`check users\` - See recent signups\n` +
      `• \`database status\` - Monitor status\n\n` +
      `*General:*\n` +
      `• \`hello\` - Introduction\n` +
      `• \`help\` - This message\n\n` +
      `Just ask naturally and I'll route to the right agent!`,
      threadTs
    );
  }

  // Default fallback - intelligent response
  return await sendToSlack(
    `🤔 I understand you said: "${message}"\n\n` +
    `I'm routing this to the general AI agent. How can I assist you?`,
    threadTs
  );
}

/**
 * Send message to Slack
 */
async function sendToSlack(message, threadTs = null) {
  try {
    const body = {
      channel: SLACK_CHANNEL,
      text: message
    };

    if (threadTs) {
      body.thread_ts = threadTs;
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error('Failed to send message:', error.message);
    return false;
  }
}

/**
 * Process incoming message
 */
async function processMessage(message) {
  const text = message.text || '';
  const agent = routeToAgent(text);

  console.log(`📨 Message: "${text}"`);
  console.log(`🎯 Routing to: ${AGENTS[agent].name}`);

  // Route to appropriate agent
  switch (agent) {
    case 'sales':
      await handleSalesAgent(text, message.ts);
      break;
    case 'database':
      await handleDatabaseAgent(text, message.ts);
      break;
    case 'general':
      await handleGeneralChat(text, message.ts);
      break;
  }
}

/**
 * Check for new messages
 */
async function checkMessages() {
  try {
    const response = await fetch(
      `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL}&oldest=${lastCheckedTime}&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`
        }
      }
    );

    const data = await response.json();

    if (!data.ok || !data.messages) {
      return;
    }

    // Process messages in reverse order (oldest first)
    const messages = data.messages.reverse();

    for (const message of messages) {
      const messageTime = parseFloat(message.ts);

      // Skip old messages
      if (messageTime <= lastCheckedTime) {
        continue;
      }

      // Skip bot's own messages
      if (message.bot_id) {
        continue;
      }

      // Update last checked time
      lastCheckedTime = messageTime;

      // Process the message
      await processMessage(message);
    }
  } catch (error) {
    console.error('Error checking messages:', error.message);
  }
}

/**
 * Start the unified bot
 */
function startUnifiedBot() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║              🤖 UNIFIED SLACK BOT - ALL AGENTS CONNECTED                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log('🔗 Connected Agents:');
  Object.entries(AGENTS).forEach(([key, agent]) => {
    console.log(`   • ${agent.name}`);
    console.log(`     ${agent.description}`);
  });

  console.log('\n📱 Channel: ' + SLACK_CHANNEL);
  console.log('🔄 Polling every 2 seconds');
  console.log('🧠 Intelligent routing enabled\n');
  console.log('━'.repeat(80) + '\n');

  // Send startup message to Slack
  sendToSlack(
    `🚀 *Unified AI Bot Online!*\n\n` +
    `Connected agents:\n` +
    `• 💼 Sales Agent - Email campaigns\n` +
    `• 📊 Database Monitor - User tracking\n` +
    `• 💬 Terrorizer AI - General help\n\n` +
    `Type \`help\` to see available commands!`
  );

  // Poll for messages every 2 seconds
  setInterval(checkMessages, 2000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Unified bot stopped');
  sendToSlack('🛑 Unified AI Bot going offline...');
  setTimeout(() => process.exit(0), 1000);
});

// Start the unified bot
startUnifiedBot();
