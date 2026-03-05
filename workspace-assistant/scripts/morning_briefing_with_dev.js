#!/usr/bin/env node

/**
 * Enhanced Morning Briefing with Dev Activity
 * Combines email, calendar, and GitHub status
 */

const fs = require('fs');
const {google} = require('googleapis');
const { execSync } = require('child_process');

const TOKEN_PATH = require('path').join(process.env.HOME, '.openclaw', 'google-token.json');
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6';
const WHATSAPP_NUMBER = '+918005729753';
const REPOS = ['Terrorizer-AI/opentelemetry-js'];

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    return null;
  }
}

async function getEmailSummary() {
  try {
    const auth = google.auth.fromJSON(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    const gmail = google.gmail({version: 'v1', auth});

    const unreadRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
      q: 'is:unread'
    });

    const totalUnread = unreadRes.data.resultSizeEstimate || 0;
    const messages = unreadRes.data.messages || [];

    let summary = `📧 *Email Summary*\n`;
    summary += `   • ${totalUnread} unread messages\n`;

    if (messages.length > 0) {
      summary += `   • Recent:\n`;
      for (const message of messages.slice(0, 3)) {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject']
        });

        const headers = msg.data.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const fromName = from.split('<')[0].trim();
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';

        summary += `     - ${fromName}: ${subject.substring(0, 50)}${subject.length > 50 ? '...' : ''}\n`;
      }
    }

    return summary;
  } catch (error) {
    return `📧 Email: Unable to check (${error.message})`;
  }
}

async function getCalendarSummary() {
  try {
    const auth = google.auth.fromJSON(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    const calendar = google.calendar({version: 'v3', auth});

    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res.data.items || [];

    let summary = `📅 *Today's Schedule*\n`;

    if (events.length === 0) {
      summary += `   • No events scheduled\n`;
    } else {
      summary += `   • ${events.length} event(s):\n`;
      events.forEach(event => {
        const start = event.start.dateTime || event.start.date;
        const startDate = new Date(start);
        const timeStr = event.start.dateTime
          ? startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'All day';

        summary += `     - ${timeStr}: ${event.summary || '(No title)'}\n`;
      });
    }

    return summary;
  } catch (error) {
    return `📅 Calendar: Unable to check (${error.message})`;
  }
}

function getGitHubSummary() {
  let summary = `💻 *Dev Activity*\n`;

  try {
    // Check open PRs
    const openPRsData = runCommand(`gh pr list --repo ${REPOS[0]} --state open --json number`);
    let openPRs = 0;
    if (openPRsData) {
      openPRs = JSON.parse(openPRsData).length;
    }

    // Check merged PRs (last 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const mergedData = runCommand(`gh pr list --repo ${REPOS[0]} --state merged --json mergedAt --limit 50`);
    let mergedToday = 0;
    if (mergedData) {
      const merged = JSON.parse(mergedData);
      mergedToday = merged.filter(pr => pr.mergedAt > yesterday).length;
    }

    // Check CI failures
    const runsData = runCommand(`gh run list --repo ${REPOS[0]} --limit 10 --json conclusion`);
    let failedBuilds = 0;
    if (runsData) {
      const runs = JSON.parse(runsData);
      failedBuilds = runs.filter(r => r.conclusion === 'failure').length;
    }

    if (openPRs > 0) summary += `   • ${openPRs} open PR(s)\n`;
    if (mergedToday > 0) summary += `   • ✅ ${mergedToday} merged yesterday\n`;
    if (failedBuilds > 0) summary += `   • 🔴 ${failedBuilds} failed builds\n`;
    if (openPRs === 0 && mergedToday === 0 && failedBuilds === 0) {
      summary += `   • All clean!\n`;
    }

    return summary;
  } catch (error) {
    return `💻 *Dev Activity*\n   • Unable to check GitHub\n`;
  }
}

function getWeather() {
  const hour = new Date().getHours();
  let greeting = '🌅 Good Morning!';
  if (hour >= 12 && hour < 17) greeting = '☀️ Good Afternoon!';
  if (hour >= 17) greeting = '🌆 Good Evening!';

  return greeting;
}

function getTopPriorities() {
  return `🎯 *Today's Priorities*
   • Check and respond to urgent emails
   • Review open PRs and code reviews
   • Work on high-priority tasks`;
}

async function sendToSlack(message) {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        text: message
      })
    });

    const data = await response.json();
    if (data.ok) {
      console.log('✅ Sent to Slack');
    } else {
      console.log('⚠️  Slack API failed:', data.error);
    }
  } catch (error) {
    console.log('⚠️  Could not send to Slack:', error.message);
  }
}

async function sendToWhatsApp(message) {
  try {
    const escapedMessage = message.replace(/'/g, "'\\''");

    execSync(`openclaw agent --agent squad-brain --message 'Send this to WhatsApp ${WHATSAPP_NUMBER}: ${escapedMessage}'`, {
      stdio: 'pipe',
      timeout: 30000
    });

    console.log('✅ Sent to WhatsApp');
  } catch (error) {
    console.log('⚠️  Could not send to WhatsApp:', error.message);
  }
}

async function main() {
  console.log('🚀 Generating enhanced morning briefing...\n');

  const greeting = getWeather();
  const emailSummary = await getEmailSummary();
  const calendarSummary = await getCalendarSummary();
  const githubSummary = getGitHubSummary();
  const priorities = getTopPriorities();

  const briefing = `${greeting}

${emailSummary}

${calendarSummary}

${githubSummary}

${priorities}

Have a productive day! 🚀`;

  console.log('Generated briefing:');
  console.log('==================');
  console.log(briefing);
  console.log('==================\n');

  // Send to Slack
  await sendToSlack(briefing);

  // Send to WhatsApp
  await sendToWhatsApp(briefing);

  console.log('\n✨ Enhanced morning briefing sent!');
}

main().catch(console.error);
