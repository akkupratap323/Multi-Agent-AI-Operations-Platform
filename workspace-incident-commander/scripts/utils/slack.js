#!/usr/bin/env node

/**
 * Slack API utilities for incident management
 */

const fs = require('fs');
const config = require('../config');

const HEADERS = {
  'Authorization': `Bearer ${config.SLACK_BOT_TOKEN}`,
  'Content-Type': 'application/json'
};

/**
 * Get or create the #incidents channel
 */
async function getIncidentsChannel() {
  // Check cached channel ID
  if (fs.existsSync(config.CHANNEL_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(config.CHANNEL_FILE, 'utf8'));
      if (data.channelId) return data.channelId;
    } catch (e) { /* ignore */ }
  }

  // Try to create #incidents channel
  const channel = await createChannel('incidents');
  if (channel) {
    fs.writeFileSync(config.CHANNEL_FILE, JSON.stringify({ channelId: channel }, null, 2));
    await postMessage(channel, '🚨 *Incident Commander Online*\n\nThis channel receives all incident alerts. War rooms will be created as separate channels.');
    return channel;
  }

  // Fallback to existing channel
  return config.SLACK_FALLBACK_CHANNEL;
}

/**
 * Post a message to a Slack channel
 */
async function postMessage(channel, text, blocks = null) {
  try {
    const body = { channel, text };
    if (blocks) body.blocks = blocks;

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Slack postMessage error:', data.error);
      return null;
    }
    return { ts: data.ts, channel: data.channel };
  } catch (error) {
    console.error('Slack postMessage failed:', error.message);
    return null;
  }
}

/**
 * Create a new Slack channel
 */
async function createChannel(name) {
  try {
    const response = await fetch('https://slack.com/api/conversations.create', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ name, is_private: false })
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`Created Slack channel: #${name}`);
      return data.channel.id;
    }

    // Channel already exists — find it
    if (data.error === 'name_taken') {
      return await findChannel(name);
    }

    console.error('Create channel error:', data.error);
    return null;
  } catch (error) {
    console.error('Create channel failed:', error.message);
    return null;
  }
}

/**
 * Find an existing channel by name
 */
async function findChannel(name) {
  try {
    const response = await fetch(`https://slack.com/api/conversations.list?types=public_channel&limit=200`, {
      headers: HEADERS
    });

    const data = await response.json();
    if (data.ok) {
      const channel = data.channels.find(c => c.name === name);
      if (channel) return channel.id;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Set channel topic
 */
async function setChannelTopic(channelId, topic) {
  try {
    await fetch('https://slack.com/api/conversations.setTopic', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ channel: channelId, topic })
    });
  } catch (error) {
    console.error('Set topic failed:', error.message);
  }
}

/**
 * Invite users to a channel
 */
async function inviteToChannel(channelId, userIds) {
  try {
    await fetch('https://slack.com/api/conversations.invite', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ channel: channelId, users: userIds.join(',') })
    });
  } catch (error) {
    console.error('Invite failed:', error.message);
  }
}

/**
 * Post an incident card with Block Kit formatting
 */
async function postIncidentCard(channel, incident) {
  const severityEmoji = { P1: '🔴', P2: '🟠', P3: '🟡' };
  const emoji = severityEmoji[incident.severity] || '⚪';

  const fixesList = (incident.suggestedFixes || [])
    .map((fix, i) => `${i + 1}. ${fix.description}`)
    .join('\n');

  const text =
    `${emoji} *${incident.severity} INCIDENT — ${incident.incidentNumber}*\n\n` +
    `*Service:* ${incident.serviceType} / ${incident.resourceId}\n` +
    `*Metric:* ${incident.metric} at ${incident.metricValue} (threshold: ${incident.thresholdValue})\n` +
    `*Detected:* ${new Date().toLocaleString('en-US', { timeZone: config.TIMEZONE })}\n\n` +
    `*Root Cause (${Math.round((incident.confidence || 0) * 100)}% confidence):*\n${incident.rootCause || 'Analyzing...'}\n\n` +
    `*Suggested Fixes:*\n${fixesList || 'None generated yet'}\n\n` +
    `Reply \`approve 1\` to approve fix #1, or \`reject\` to dismiss.`;

  return await postMessage(channel, text);
}

/**
 * Poll a channel for approval messages
 * Looks for "approve", "approve N", "reject" messages
 */
async function pollForApproval(channelId, afterTs, timeoutMinutes = 30) {
  const deadline = Date.now() + (timeoutMinutes * 60 * 1000);
  let lastChecked = parseFloat(afterTs);

  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${lastChecked}&limit=20`,
        { headers: HEADERS }
      );

      const data = await response.json();
      if (data.ok && data.messages) {
        for (const msg of data.messages.reverse()) {
          if (msg.bot_id) continue;
          const msgTime = parseFloat(msg.ts);
          if (msgTime <= lastChecked) continue;
          lastChecked = msgTime;

          const text = (msg.text || '').toLowerCase().trim();

          if (text.startsWith('approve')) {
            const fixNum = parseInt(text.replace('approve', '').trim()) || 1;
            return { approved: true, fixIndex: fixNum - 1, approver: msg.user, messageTs: msg.ts };
          }

          if (text === 'reject' || text === 'cancel' || text === 'dismiss') {
            return { approved: false, approver: msg.user, messageTs: msg.ts };
          }
        }
      }
    } catch (error) {
      console.error('Poll error:', error.message);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, config.APPROVAL_POLL_INTERVAL_MS));
  }

  return { approved: false, timedOut: true };
}

/**
 * Archive a channel
 */
async function archiveChannel(channelId) {
  try {
    await fetch('https://slack.com/api/conversations.archive', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ channel: channelId })
    });
  } catch (error) {
    console.error('Archive failed:', error.message);
  }
}

module.exports = {
  getIncidentsChannel,
  postMessage,
  createChannel,
  findChannel,
  setChannelTopic,
  inviteToChannel,
  postIncidentCard,
  pollForApproval,
  archiveChannel
};
