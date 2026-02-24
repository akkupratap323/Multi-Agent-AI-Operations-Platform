#!/usr/bin/env node

/**
 * Severity-based Workflows Engine
 * - Different response actions based on P1/P2/P3
 * - Auto-remediation for P3 (optional)
 * - Configurable notification channels per severity
 * - Customizable escalation timing per severity
 */

const config = require('../config');

/**
 * Severity workflow definitions
 * Defines what actions happen at each severity level
 */
const WORKFLOWS = {
  P1: {
    name: 'Critical',
    actions: {
      createWarRoom: true,
      notifySlack: true,
      notifyWhatsApp: true,
      notifyEmail: true,
      notifyPhone: true,
      pageOnCall: true,
      autoEscalate: true,
      escalateAfterMinutes: 3,
      requireApproval: true,
      autoRemediate: false,
      runRunbooks: true,
      updateStatusPage: true,
      postToMainChannel: true,
      inviteStakeholders: true,
      generatePostmortem: true
    },
    slackEmoji: ':red_circle:',
    responseTimeTarget: 300, // 5 minutes
    resolutionTimeTarget: 3600, // 1 hour
    stakeholders: ['engineering-leads', 'on-call-manager']
  },

  P2: {
    name: 'High',
    actions: {
      createWarRoom: true,
      notifySlack: true,
      notifyWhatsApp: true,
      notifyEmail: true,
      notifyPhone: false,
      pageOnCall: true,
      autoEscalate: true,
      escalateAfterMinutes: 10,
      requireApproval: true,
      autoRemediate: false,
      runRunbooks: true,
      updateStatusPage: true,
      postToMainChannel: true,
      inviteStakeholders: false,
      generatePostmortem: true
    },
    slackEmoji: ':large_orange_circle:',
    responseTimeTarget: 900, // 15 minutes
    resolutionTimeTarget: 14400, // 4 hours
    stakeholders: []
  },

  P3: {
    name: 'Medium',
    actions: {
      createWarRoom: false,
      notifySlack: true,
      notifyWhatsApp: false,
      notifyEmail: true,
      notifyPhone: false,
      pageOnCall: false,
      autoEscalate: false,
      escalateAfterMinutes: 30,
      requireApproval: false, // Can auto-remediate
      autoRemediate: true,
      runRunbooks: true,
      updateStatusPage: true,
      postToMainChannel: true,
      inviteStakeholders: false,
      generatePostmortem: false
    },
    slackEmoji: ':large_yellow_circle:',
    responseTimeTarget: 3600, // 1 hour
    resolutionTimeTarget: 86400, // 24 hours
    stakeholders: []
  }
};

/**
 * Get workflow for a severity level
 */
function getWorkflow(severity) {
  return WORKFLOWS[severity] || WORKFLOWS.P3;
}

/**
 * Check if an action should be performed for given severity
 */
function shouldPerformAction(severity, action) {
  const workflow = getWorkflow(severity);
  return workflow.actions[action] || false;
}

/**
 * Get escalation timeout for severity
 */
function getEscalationTimeout(severity) {
  const workflow = getWorkflow(severity);
  return workflow.actions.escalateAfterMinutes || 10;
}

/**
 * Check if auto-remediation is enabled for severity
 */
function isAutoRemediationEnabled(severity) {
  const workflow = getWorkflow(severity);
  return workflow.actions.autoRemediate && !workflow.actions.requireApproval;
}

/**
 * Get response time target in seconds
 */
function getResponseTimeTarget(severity) {
  const workflow = getWorkflow(severity);
  return workflow.responseTimeTarget;
}

/**
 * Format severity display
 */
function formatSeverity(severity) {
  const workflow = getWorkflow(severity);
  return {
    emoji: workflow.slackEmoji,
    name: workflow.name,
    label: `${workflow.slackEmoji} ${severity} — ${workflow.name}`
  };
}

module.exports = {
  WORKFLOWS,
  getWorkflow,
  shouldPerformAction,
  getEscalationTimeout,
  isAutoRemediationEnabled,
  getResponseTimeTarget,
  formatSeverity
};
