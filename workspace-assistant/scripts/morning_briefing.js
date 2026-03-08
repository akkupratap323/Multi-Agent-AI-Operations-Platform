#!/usr/bin/env node

const fs = require('fs');
const {google} = require('googleapis');
const { execSync } = require('child_process');

const TOKEN_PATH = require('path').join(process.env.HOME, '.openclaw', 'google-token.json');
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = 'C0AFZ4RNNM6'; // all-nester-labs-agents-testing
const WHATSAPP_NUMBER = '+918005729753';

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

function getWeather() {
  // Simple weather - you can add API later
  const hour = new Date().getHours();
  let greeting = '🌅 Good Morning!';
  if (hour >= 12 && hour < 17) greeting = '☀️ Good Afternoon!';
  if (hour >= 17) greeting = '🌆 Good Evening!';

  return greeting;
}

function getTopPriorities() {
  return `🎯 *Today's Priorities*
   • Check and respond to urgent emails
   • Review OpenClaw AI system
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
    // Use OpenClaw agent to send WhatsApp message
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
  console.log('🚀 Generating morning briefing...\n');

  const greeting = getWeather();
  const emailSummary = await getEmailSummary();
  const calendarSummary = await getCalendarSummary();
  const priorities = getTopPriorities();

  const briefing = `${greeting}

${emailSummary}

${calendarSummary}

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

  console.log('\n✨ Morning briefing sent!');
}

main().catch(console.error);
