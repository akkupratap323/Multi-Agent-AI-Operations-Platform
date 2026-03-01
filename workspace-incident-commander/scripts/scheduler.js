#!/usr/bin/env node

/**
 * Incident Commander — Cron Scheduler
 * Runs periodic background tasks:
 *   - Weekly report  (Monday 9am)
 *   - Monthly report (1st of month, 9am)
 *   - Escalation check (every 5 minutes)
 *   - Maintenance window activation/completion (every minute)
 *   - SLO measurement collection (every hour)
 */

const cron = require('node-cron');
const config = require('./config');
const analytics = require('./utils/analytics');
const oncall = require('./utils/oncall');
const maintenance = require('./utils/maintenance');
const slo = require('./utils/slo');

const TZ = config.TIMEZONE;

console.log(`⏰ Incident Commander Scheduler started (TZ: ${TZ})`);

// ============================================================
// Escalation check — every 5 minutes
// ============================================================
cron.schedule('*/5 * * * *', async () => {
  try {
    const count = await oncall.checkEscalations();
    if (count > 0) console.log(`[scheduler] ⬆️ Escalated ${count} incident(s)`);
  } catch (err) {
    console.error('[scheduler] Escalation check error:', err.message);
  }
}, { timezone: TZ });

// ============================================================
// Maintenance window activation — every minute
// ============================================================
cron.schedule('* * * * *', async () => {
  try {
    await maintenance.checkMaintenanceWindows();
  } catch (err) {
    console.error('[scheduler] Maintenance window check error:', err.message);
  }
}, { timezone: TZ });

// ============================================================
// SLO measurement collection — every hour
// ============================================================
cron.schedule('0 * * * *', async () => {
  try {
    const alerts = await slo.checkSLOAlerts();
    if (alerts.length > 0) {
      console.log(`[scheduler] 📊 ${alerts.length} SLO alert(s) detected`);
    }
  } catch (err) {
    console.error('[scheduler] SLO check error:', err.message);
  }
}, { timezone: TZ });

// ============================================================
// Weekly report — Monday at 9:00 AM
// ============================================================
cron.schedule('0 9 * * 1', async () => {
  console.log('[scheduler] 📈 Generating weekly report...');
  try {
    await analytics.postWeeklyReport();
    console.log('[scheduler] Weekly report posted ✓');
  } catch (err) {
    console.error('[scheduler] Weekly report error:', err.message);
  }
}, { timezone: TZ });

// ============================================================
// Monthly report — 1st of each month at 9:00 AM
// ============================================================
cron.schedule('0 9 1 * *', async () => {
  console.log('[scheduler] 📅 Generating monthly report...');
  try {
    await analytics.postMonthlyReport();
    console.log('[scheduler] Monthly report posted ✓');
  } catch (err) {
    console.error('[scheduler] Monthly report error:', err.message);
  }
}, { timezone: TZ });

console.log('  Schedules active:');
console.log('  • Escalation check    — every 5 min');
console.log('  • Maintenance windows — every 1 min');
console.log('  • SLO alerts          — every hour');
console.log('  • Weekly report       — Monday 9am');
console.log('  • Monthly report      — 1st of month 9am');
