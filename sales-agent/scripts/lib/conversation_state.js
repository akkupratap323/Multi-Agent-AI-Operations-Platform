#!/usr/bin/env node

/**
 * Conversation State Manager
 * Manages multi-step ICP gathering conversation via Slack
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'conversation_state.json');

const STATES = {
  IDLE: 'IDLE',
  GATHERING_INDUSTRY: 'GATHERING_INDUSTRY',
  GATHERING_SIZE: 'GATHERING_SIZE',
  GATHERING_PAIN_POINTS: 'GATHERING_PAIN_POINTS',
  GATHERING_COUNT: 'GATHERING_COUNT',
  GATHERING_COMPANIES: 'GATHERING_COMPANIES',
  CONFIRMING: 'CONFIRMING',
  RUNNING: 'RUNNING',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL'
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveState(allStates) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(allStates, null, 2));
}

function getState(userId) {
  const all = loadState();
  return all[userId] || { state: STATES.IDLE, data: {} };
}

function setState(userId, newState, extraData = {}) {
  const all = loadState();
  const current = all[userId] || { state: STATES.IDLE, data: {} };
  all[userId] = {
    state: newState,
    data: { ...current.data, ...extraData },
    updatedAt: new Date().toISOString()
  };
  saveState(all);
  return all[userId];
}

function clearState(userId) {
  const all = loadState();
  all[userId] = { state: STATES.IDLE, data: {} };
  saveState(all);
}

function getICPConfig(userId) {
  const { data } = getState(userId);
  return {
    industry: data.industry || '',
    companySize: data.companySize || '',
    painPoints: data.painPoints || 'auto',
    prospectCount: data.prospectCount || 15,
    specificCompanies: data.specificCompanies || [],
    product: 'Nester Voice AI',
    sender: { name: 'Aditya', email: 'aditya@nesterlabs.com', company: 'Nester Labs' }
  };
}

/**
 * Save ICP config to campaign_config.json for other scripts to read
 */
function saveCampaignConfig(userId) {
  const config = getICPConfig(userId);
  const configFile = path.join(__dirname, '..', '..', 'data', 'campaign_config.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  return config;
}

module.exports = {
  STATES,
  getState,
  setState,
  clearState,
  getICPConfig,
  saveCampaignConfig
};
