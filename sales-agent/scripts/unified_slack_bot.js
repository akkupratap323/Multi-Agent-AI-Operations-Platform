#!/usr/bin/env node

/**
 * Unified Slack Bot - Central Hub for All Agents
 * Routes requests to the right agent based on intent
 * Sales Agent now has interactive ICP gathering before campaigns
 */

const fs = require('fs');
const path = require('path');
const { STATES, getState, setState, clearState, saveCampaignConfig } = require('./lib/conversation_state');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';
const DATA_DIR = path.join(__dirname, '..', 'data');

const AGENTS = {
  sales: {
    name: 'Sales Agent',
    keywords: ['sales', 'email', 'campaign', 'prospect', 'cold email', 'approve', 'reject', 'start', 'launch', 'outreach'],
    description: 'Professional cold email campaigns with real prospect research'
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

let lastCheckedTime = (Date.now() / 1000) - 60;
let activeThreads = new Map(); // threadTs -> lastCheckedTime for that thread

// ============================================================
// SALES AGENT - Interactive ICP Campaign Flow
// ============================================================

async function handleSalesAgent(message, threadTs, userId) {
  const text = message.toLowerCase().trim();
  const userState = getState(userId);

  // If user is in a conversation flow, handle that first
  if (userState.state !== STATES.IDLE) {
    return await handleConversationFlow(text, threadTs, userId, userState);
  }

  // Approval/rejection
  if (text === 'approve' || text === 'yes' || text === 'send' || text.includes('i approve')) {
    return await handleApproval(true, threadTs);
  }

  if (text === 'reject' || text === 'no' || text === 'cancel' || text.includes('i reject')) {
    return await handleApproval(false, threadTs);
  }

  // Start new campaign - begin ICP gathering
  if (text.includes('start') || text.includes('new campaign') || text.includes('begin') || text.includes('launch') || text.includes('outreach')) {
    setState(userId, STATES.GATHERING_INDUSTRY);
    await sendToSlack(
      `🚀 *Let's Set Up Your Sales Campaign!*\n\n` +
      `I'll help you build a targeted campaign with real prospect research.\n\n` +
      `First, *what industry or vertical do you want to target?*\n\n` +
      `Examples:\n` +
      `• SaaS\n` +
      `• E-commerce\n` +
      `• Healthcare\n` +
      `• Real Estate\n` +
      `• FinTech\n` +
      `• EdTech\n` +
      `• Logistics\n` +
      `• Or any specific niche...`,
      threadTs
    );
    return true;
  }

  // Status check
  if (text.includes('status') || text.includes('campaign')) {
    const approvalFile = path.join(DATA_DIR, 'approval_status.json');
    if (fs.existsSync(approvalFile)) {
      const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
      return await sendToSlack(
        `📊 *Sales Campaign Status*\n\n` +
        `• Status: ${approval.status}\n` +
        `• Emails ready: ${approval.emailCount || 'unknown'}\n` +
        `• Requested: ${new Date(approval.requestedAt).toLocaleString()}`,
        threadTs
      );
    }
    return await sendToSlack(`📊 *Sales Campaign Status*\n\nNo pending campaigns. Type \`start campaign\` to begin.`, threadTs);
  }

  // General sales help
  return await sendToSlack(
    `💼 *Sales Agent - Professional Cold Email System*\n\n` +
    `*Commands:*\n` +
    `• \`start campaign\` - Begin new campaign (with ICP targeting)\n` +
    `• \`approve\` - Approve pending email campaign\n` +
    `• \`reject\` - Reject pending campaign\n` +
    `• \`status\` - Check campaign status\n\n` +
    `*How it works:*\n` +
    `1. You define your target (industry, size, pain points)\n` +
    `2. I analyze the market\n` +
    `3. I find REAL companies matching your ICP\n` +
    `4. I discover real decision-maker emails\n` +
    `5. AI writes personalized emails for each prospect\n` +
    `6. You review and approve before sending\n` +
    `7. Emails sent via Gmail API`,
    threadTs
  );
}

/**
 * Handle the multi-step ICP gathering conversation
 */
async function handleConversationFlow(text, threadTs, userId, userState) {
  const state = userState.state;

  // Allow cancelling at any point
  if (text === 'cancel' || text === 'stop' || text === 'exit') {
    clearState(userId);
    await sendToSlack(`❌ Campaign setup cancelled.`, threadTs);
    return true;
  }

  switch (state) {
    case STATES.GATHERING_INDUSTRY: {
      setState(userId, STATES.GATHERING_SIZE, { industry: text });
      await sendToSlack(
        `✅ Industry: *${text}*\n\n` +
        `Now, *what company size are you targeting?*\n\n` +
        `Examples:\n` +
        `• 1-10 employees (startups)\n` +
        `• 10-50 employees (small business)\n` +
        `• 50-200 employees (mid-market)\n` +
        `• 200-1000 employees (enterprise)\n` +
        `• any`,
        threadTs
      );
      return true;
    }

    case STATES.GATHERING_SIZE: {
      setState(userId, STATES.GATHERING_PAIN_POINTS, { companySize: text });
      await sendToSlack(
        `✅ Company Size: *${text}*\n\n` +
        `*What pain points should I target in the outreach?*\n\n` +
        `Examples:\n` +
        `• High support costs\n` +
        `• Slow response times\n` +
        `• Scaling customer support\n` +
        `• After-hours coverage\n` +
        `• Multilingual support needs\n\n` +
        `Or type \`auto\` and I'll analyze the best angles for this market.`,
        threadTs
      );
      return true;
    }

    case STATES.GATHERING_PAIN_POINTS: {
      setState(userId, STATES.GATHERING_COUNT, { painPoints: text });
      await sendToSlack(
        `✅ Pain Points: *${text}*\n\n` +
        `*How many prospects should I research?* (5-50)\n\n` +
        `Recommended: 10-15 for quality outreach`,
        threadTs
      );
      return true;
    }

    case STATES.GATHERING_COUNT: {
      const count = parseInt(text) || 15;
      const clampedCount = Math.max(5, Math.min(50, count));
      setState(userId, STATES.GATHERING_COMPANIES, { prospectCount: clampedCount });
      await sendToSlack(
        `✅ Prospect Count: *${clampedCount}*\n\n` +
        `*Any specific companies you want me to include?*\n\n` +
        `List them separated by commas, or type \`none\``,
        threadTs
      );
      return true;
    }

    case STATES.GATHERING_COMPANIES: {
      const companies = text === 'none' || text === 'no'
        ? []
        : text.split(',').map(c => c.trim()).filter(c => c.length > 0);

      setState(userId, STATES.CONFIRMING, { specificCompanies: companies });

      const config = saveCampaignConfig(userId);
      const companiesText = companies.length > 0 ? companies.join(', ') : 'None';

      await sendToSlack(
        `📋 *Campaign Configuration:*\n\n` +
        `• *Industry:* ${config.industry}\n` +
        `• *Company Size:* ${config.companySize}\n` +
        `• *Pain Points:* ${config.painPoints}\n` +
        `• *Prospect Count:* ${config.prospectCount}\n` +
        `• *Specific Companies:* ${companiesText}\n` +
        `• *Product:* ${config.product}\n` +
        `• *Sender:* ${config.sender.name} (${config.sender.email})\n\n` +
        `Type \`confirm\` to start the campaign or \`edit\` to change settings.`,
        threadTs
      );
      return true;
    }

    case STATES.CONFIRMING: {
      if (text.includes('edit') || text.includes('change')) {
        clearState(userId);
        setState(userId, STATES.GATHERING_INDUSTRY);
        await sendToSlack(`🔄 Let's start over. *What industry do you want to target?*`, threadTs);
        return true;
      }

      if (text.includes('confirm') || text.includes('yes') || text.includes('go') || text.includes('start')) {
        setState(userId, STATES.RUNNING);
        await runCampaignPipeline(userId, threadTs);
        return true;
      }

      await sendToSlack(`Type \`confirm\` to start or \`edit\` to change settings.`, threadTs);
      return true;
    }

    case STATES.RUNNING: {
      const runningMsg = text.includes('approve') || text.includes('yes') || text.includes('send')
        ? `⏳ Campaign is still running. When you see *"Ready to Send"*, type \`approve\` again to send the emails.`
        : `⏳ Campaign is already running. Please wait for it to complete.`;
      await sendToSlack(runningMsg, threadTs);
      return true;
    }

    case 'AWAITING_APPROVAL': {
      if (text.includes('approve') || text.includes('yes') || text.includes('send')) {
        clearState(userId);
        return await handleApproval(true, threadTs);
      }

      if (text.includes('reject') || text.includes('no') || text.includes('cancel') || text.includes('deny')) {
        clearState(userId);
        return await handleApproval(false, threadTs);
      }

      if (text.includes('edit') || text.includes('regenerate') || text.includes('rewrite')) {
        await sendToSlack(`✏️ *Regenerating emails with fresh AI writing...*`, threadTs);
        setState(userId, STATES.RUNNING);
        try {
          const { generateEmails } = require('./email_generator');
          const emails = await generateEmails();
          if (emails.length === 0) throw new Error('Failed to regenerate emails.');

          // Show all regenerated emails
          for (let i = 0; i < emails.length; i++) {
            const e = emails[i];
            const preview =
              `📧 *Email ${i + 1}/${emails.length}* (Regenerated)\n\n` +
              `*To:* ${e.recipientName || 'N/A'} <${e.to}>\n` +
              `*Company:* ${e.company}\n` +
              `*Subject:* ${e.subject}\n\n` +
              `${e.body}\n\n` +
              `${'━'.repeat(40)}`;
            await sendToSlack(preview, threadTs);
          }

          fs.writeFileSync(path.join(DATA_DIR, 'approval_status.json'), JSON.stringify({
            status: 'pending',
            requestedAt: new Date().toISOString(),
            emailCount: emails.length,
            threadTs: threadTs
          }, null, 2));

          setState(userId, 'AWAITING_APPROVAL');
          await sendToSlack(
            `\n✅ *${emails.length} emails regenerated!*\n\n` +
            `Choose an action:\n` +
            `✅ \`approve\` — Send all emails via Gmail\n` +
            `✏️ \`edit\` — Regenerate again\n` +
            `❌ \`reject\` — Cancel campaign`,
            threadTs
          );
        } catch (error) {
          await sendToSlack(`❌ *Regeneration failed:* ${error.message}`, threadTs);
          setState(userId, 'AWAITING_APPROVAL');
        }
        return true;
      }

      await sendToSlack(
        `Please choose an action:\n` +
        `✅ \`approve\` — Send emails\n` +
        `✏️ \`edit\` — Regenerate emails\n` +
        `❌ \`reject\` — Cancel campaign`,
        threadTs
      );
      return true;
    }

    default: {
      clearState(userId);
      return false;
    }
  }
}

/**
 * Run the full campaign pipeline
 */
async function runCampaignPipeline(userId, threadTs) {
  const configFile = path.join(DATA_DIR, 'campaign_config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

  await sendToSlack(
    `🚀 *Starting Professional Sales Campaign*\n\n` +
    `Target: ${config.industry} companies (${config.companySize} employees)\n` +
    `This will take 3-5 minutes. I'll update you at each step.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    threadTs
  );

  try {
    // Step 1: Market Analysis
    await sendToSlack(`⏳ *Step 1/5: Analyzing ${config.industry} market...*`, threadTs);
    const { analyzeMarket, formatForSlack: formatMarket } = require('./market_analyzer');
    const marketResult = await analyzeMarket(config);
    if (marketResult) {
      await sendToSlack(formatMarket(marketResult), threadTs);
    }

    // Step 2: Prospect Research
    await sendToSlack(`\n⏳ *Step 2/5: Finding real ${config.industry} companies...*`, threadTs);
    const { researchProspects, formatForSlack: formatProspects } = require('./research_prospects');
    const prospects = await researchProspects(config);
    if (prospects.length > 0) {
      await sendToSlack(formatProspects(prospects), threadTs);
    } else {
      throw new Error('No prospects found. Try a different industry or company size.');
    }

    // Step 3: Email Discovery
    await sendToSlack(`\n⏳ *Step 3/5: Finding decision-maker emails...*`, threadTs);
    const { findEmails, formatForSlack: formatEmails } = require('./email_finder');
    const withEmails = await findEmails();
    await sendToSlack(formatEmails(withEmails), threadTs);

    const emailableProspects = withEmails.filter(p => p.contactEmail);
    if (emailableProspects.length === 0) {
      throw new Error('Could not find emails for any prospects.');
    }

    // Step 4: Generate Personalized Emails
    await sendToSlack(`\n⏳ *Step 4/5: AI is writing personalized emails for ${emailableProspects.length} prospects...*`, threadTs);
    const { generateEmails } = require('./email_generator');
    const emails = await generateEmails();

    if (emails.length === 0) {
      throw new Error('Failed to generate emails.');
    }

    // Step 5: Show ALL Email Previews
    await sendToSlack(`\n⏳ *Step 5/5: Preparing email previews...*`, threadTs);
    await sendToSlack(`\n📧 *All ${emails.length} Generated Emails:*\n`, threadTs);

    // Send emails in chunks to avoid Slack message size limits
    for (let i = 0; i < emails.length; i++) {
      const e = emails[i];
      const preview =
        `📧 *Email ${i + 1}/${emails.length}*\n\n` +
        `*To:* ${e.recipientName || 'N/A'} <${e.to}>\n` +
        `*Company:* ${e.company}\n` +
        `*Subject:* ${e.subject}\n\n` +
        `${e.body}\n\n` +
        `${'━'.repeat(40)}`;
      await sendToSlack(preview, threadTs);
    }

    // Save approval status
    fs.writeFileSync(path.join(DATA_DIR, 'approval_status.json'), JSON.stringify({
      status: 'pending',
      requestedAt: new Date().toISOString(),
      emailCount: emails.length,
      threadTs: threadTs
    }, null, 2));

    // Ask for approval with clear options
    await sendToSlack(
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🚀 *Ready to Send ${emails.length} Personalized Emails!*\n\n` +
      `All emails are AI-written and personalized for each prospect.\n\n` +
      `Choose an action:\n` +
      `✅ \`approve\` — Send all ${emails.length} emails via Gmail now\n` +
      `✏️ \`edit\` — Regenerate all emails with different tone/angle\n` +
      `❌ \`reject\` — Cancel this campaign entirely\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      threadTs
    );

    // Set state to AWAITING_APPROVAL so thread replies are handled
    setState(userId, 'AWAITING_APPROVAL');

  } catch (error) {
    console.error('Campaign pipeline error:', error);
    await sendToSlack(
      `❌ *Campaign Error*\n\n${error.message}\n\nType \`start campaign\` to try again.`,
      threadTs
    );
    clearState(userId);
  }
}

/**
 * Handle approve/reject
 */
async function handleApproval(approved, threadTs) {
  const approvalFile = path.join(DATA_DIR, 'approval_status.json');

  if (approved) {
    // Send immediate ack so user always gets a reply (even if file/Gmail fails later)
    await sendToSlack(`✅ *Got it — approving and sending emails...*`, threadTs);
  }

  if (!fs.existsSync(approvalFile)) {
    await sendToSlack(`⚠️ No pending campaign. Type \`start campaign\` to begin.`, threadTs);
    return true;
  }

  const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
  if (approval.status !== 'pending') {
    await sendToSlack(`⚠️ No pending campaign. Status: ${approval.status}`, threadTs);
    return true;
  }

  if (approved) {
    approval.status = 'approved';
    fs.writeFileSync(approvalFile, JSON.stringify(approval, null, 2));

    await sendToSlack(`📤 Sending ${approval.emailCount} emails via Gmail API...`, threadTs);

    try {
      const { sendApprovedEmails, formatResultsForSlack } = require('./email_sender');
      const results = await sendApprovedEmails();
      if (results) {
        await sendToSlack(formatResultsForSlack(results), threadTs);
      } else {
        await sendToSlack(`⚠️ Send returned no results. Check Gmail credentials.`, threadTs);
      }
    } catch (error) {
      console.error('Gmail send error:', error);
      await sendToSlack(`❌ *Send Error:* ${error.message}\n\nCheck Gmail OAuth token at ~/.openclaw/google-token.json`, threadTs);
    }
  } else {
    approval.status = 'rejected';
    fs.writeFileSync(approvalFile, JSON.stringify(approval, null, 2));
    await sendToSlack(`❌ *Campaign REJECTED.* No emails will be sent.`, threadTs);
  }

  return true;
}

// ============================================================
// DATABASE AGENT (unchanged)
// ============================================================

async function handleDatabaseAgent(message, threadTs) {
  const text = message.toLowerCase();

  if (text.includes('check') || text.includes('users') || text.includes('signups') || text.includes('database') || text.includes('show')) {
    await sendToSlack(`🔍 *Querying Ultron Database...*\n\nProcessing: "${message}"`, threadTs);

    const { execSync } = require('child_process');
    try {
      const safeMessage = message.replace(/[^a-zA-Z0-9 ]/g, '');
      const output = execSync(`node /Users/apple/.openclaw/workspace-dev-monitor/scripts/query_users_smart.js "${safeMessage}"`, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024
      });

      const lines = output.split('\n');
      let resultStart = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('Found') || lines[i].startsWith('No users')) {
          resultStart = i;
          break;
        }
      }
      const result = lines.slice(resultStart).join('\n').trim();
      await sendToSlack(`✅ *Ultron Database Results*\n\n${result}`, threadTs);
      return true;
    } catch (error) {
      await sendToSlack(
        `❌ *Database Query Failed*\n\nError: ${error.message}\n\nTry: "show me 5 new users"`,
        threadTs
      );
      return true;
    }
  }

  return await sendToSlack(
    `📊 *Database Monitor*\n\nJust ask naturally:\n• "show me 5 new users"\n• "get all users from today"\n• "who signed up yesterday"`,
    threadTs
  );
}

// ============================================================
// GENERAL CHAT (unchanged)
// ============================================================

async function handleGeneralChat(message, threadTs) {
  const text = message.toLowerCase();

  if (text === 'hello' || text === 'hi') {
    return await sendToSlack(
      `👋 *Hello! I'm your Nester Labs AI Assistant*\n\n` +
      `I can help with:\n\n` +
      `💼 *Sales Agent* - Professional cold email campaigns\n` +
      `📊 *Database Monitor* - User signup tracking\n` +
      `💬 *General Help* - Answer questions\n\n` +
      `Type \`start campaign\` to begin a sales campaign!`,
      threadTs
    );
  }

  if (text === 'help') {
    return await sendToSlack(
      `🤖 *Nester Labs AI - Commands*\n\n` +
      `*Sales:*\n` +
      `• \`start campaign\` - Begin targeted outreach\n` +
      `• \`approve\` / \`reject\` - Manage campaigns\n` +
      `• \`status\` - Campaign status\n\n` +
      `*Database:*\n` +
      `• "show me 5 new users"\n` +
      `• "users from yesterday"\n\n` +
      `*General:*\n` +
      `• \`hello\` / \`help\``,
      threadTs
    );
  }

  return await sendToSlack(
    `🤔 I understand: "${message}"\n\nTry \`help\` to see available commands.`,
    threadTs
  );
}

// ============================================================
// CORE BOT INFRASTRUCTURE
// ============================================================

function routeToAgent(message) {
  const text = message.toLowerCase();

  for (const keyword of AGENTS.sales.keywords) {
    if (text.includes(keyword)) return 'sales';
  }
  for (const keyword of AGENTS.database.keywords) {
    if (text.includes(keyword)) return 'database';
  }
  return 'general';
}

async function sendToSlack(message, threadTs = null) {
  try {
    const body = { channel: SLACK_CHANNEL, text: message };
    if (threadTs) {
      body.thread_ts = threadTs;
      // Track this thread so we poll for replies
      if (!activeThreads.has(threadTs)) {
        activeThreads.set(threadTs, parseFloat(threadTs));
      }
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
    // If we started a new thread, track the thread_ts from the response
    if (result.ok && result.ts && !threadTs) {
      activeThreads.set(result.ts, parseFloat(result.ts));
    }
    return result.ok;
  } catch (error) {
    console.error('Failed to send message:', error.message);
    return false;
  }
}

function cleanMessage(text) {
  return text
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/["""'']/g, '')
    .replace(/[\\`$]/g, '')
    .trim();
}

async function processMessage(message) {
  const rawText = message.text || '';
  const text = cleanMessage(rawText);
  if (!text) return;

  const userId = message.user || 'default';
  // Use thread_ts if this is a thread reply, otherwise use message ts
  const replyTs = message.thread_ts || message.ts;

  // Check if user is in a sales conversation flow
  const userState = getState(userId);
  if (userState.state !== STATES.IDLE) {
    console.log(`📨 Message: "${text}" (conversation flow: ${userState.state})`);
    await handleSalesAgent(text, replyTs, userId);
    return;
  }

  const agent = routeToAgent(text);
  console.log(`📨 Message: "${text}"`);
  console.log(`🎯 Routing to: ${AGENTS[agent].name}`);

  switch (agent) {
    case 'sales':
      await handleSalesAgent(text, replyTs, userId);
      break;
    case 'database':
      await handleDatabaseAgent(text, replyTs);
      break;
    case 'general':
      await handleGeneralChat(text, replyTs);
      break;
  }
}

async function checkMessages() {
  try {
    // Ensure we poll the pending-approval thread even after bot restart (activeThreads is in-memory only)
    const approvalFile = path.join(DATA_DIR, 'approval_status.json');
    if (fs.existsSync(approvalFile)) {
      try {
        const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
        if (approval.status === 'pending' && approval.threadTs) {
          const t = String(approval.threadTs);
          if (!activeThreads.has(t)) {
            // Use requestedAt so we only see replies after "Ready to Send" (avoid reprocessing "confirm")
            const oldest = approval.requestedAt
              ? Math.floor(new Date(approval.requestedAt).getTime() / 1000) - 1
              : parseFloat(t);
            activeThreads.set(t, oldest);
            console.log(`📌 Re-attached pending approval thread ${t} (e.g. after bot restart)`);
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Check main channel messages
    const response = await fetch(
      `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL}&oldest=${lastCheckedTime}&limit=10`,
      { headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` } }
    );

    const data = await response.json();
    if (data.ok && data.messages) {
      const messages = data.messages.reverse();
      for (const message of messages) {
        const messageTime = parseFloat(message.ts);
        if (messageTime <= lastCheckedTime) continue;
        if (message.bot_id) continue;
        lastCheckedTime = messageTime;
        await processMessage(message);
      }
    }

    // Check active threads for replies
    for (const [threadTs, threadLastChecked] of activeThreads.entries()) {
      try {
        const threadResponse = await fetch(
          `https://slack.com/api/conversations.replies?channel=${SLACK_CHANNEL}&ts=${threadTs}&oldest=${threadLastChecked}&limit=10`,
          { headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` } }
        );

        const threadData = await threadResponse.json();
        if (!threadData.ok || !threadData.messages) continue;

        for (const msg of threadData.messages) {
          const msgTime = parseFloat(msg.ts);
          if (msgTime <= threadLastChecked) continue;
          if (msg.bot_id) continue;
          if (msg.ts === threadTs) continue; // skip the parent message

          activeThreads.set(threadTs, msgTime);
          // Inject the thread_ts so processMessage knows it's a thread reply
          msg.thread_ts = threadTs;
          console.log(`📨 Thread reply: "${cleanMessage(msg.text || '')}"`);
          await processMessage(msg);
        }

        // Clean up old threads (older than 1 hour)
        if (Date.now() / 1000 - parseFloat(threadTs) > 3600) {
          activeThreads.delete(threadTs);
        }
      } catch (err) {
        // Ignore thread polling errors
      }
    }
  } catch (error) {
    console.error('Error checking messages:', error.message);
  }
}

function startUnifiedBot() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║          🤖 UNIFIED SLACK BOT - PROFESSIONAL SALES AGENT                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log('🔗 Connected Agents:');
  Object.entries(AGENTS).forEach(([, agent]) => {
    console.log(`   • ${agent.name} - ${agent.description}`);
  });

  console.log('\n📱 Channel: ' + SLACK_CHANNEL);
  console.log('🔄 Polling every 2 seconds');
  console.log('🧠 Intelligent routing + ICP conversation flow\n');
  console.log('━'.repeat(80) + '\n');

  sendToSlack(
    `🚀 *Professional Sales Bot Online!*\n\n` +
    `Connected agents:\n` +
    `• 💼 Sales Agent - Real prospect research + AI-powered emails\n` +
    `• 📊 Database Monitor - Natural language queries\n` +
    `• 💬 General Help\n\n` +
    `Type \`start campaign\` to begin targeted outreach!`
  );

  setInterval(checkMessages, 2000);
}

process.on('SIGINT', () => {
  console.log('\n\n👋 Bot stopped');
  sendToSlack('🛑 Bot going offline...');
  setTimeout(() => process.exit(0), 1000);
});

startUnifiedBot();
