#!/usr/bin/env node

const fs = require('fs');
const {google} = require('googleapis');

const TOKEN_PATH = require('path').join(process.env.HOME, '.openclaw', 'google-token.json');

async function checkCalendar(days = 1) {
  try {
    const auth = google.auth.fromJSON(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    const calendar = google.calendar({version: 'v3', auth});

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res.data.items;

    if (!events || events.length === 0) {
      console.log(`📅 No events in the next ${days} day(s)`);
      return;
    }

    console.log(`📅 ${events.length} event(s) in the next ${days} day(s):\n`);

    events.forEach(event => {
      const start = event.start.dateTime || event.start.date;
      const startDate = new Date(start);
      const timeStr = event.start.dateTime
        ? startDate.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })
        : startDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          }) + ' (All day)';

      console.log(`⏰ ${timeStr}`);
      console.log(`   ${event.summary || '(No title)'}`);
      if (event.location) {
        console.log(`   📍 ${event.location}`);
      }
      if (event.attendees) {
        console.log(`   👥 ${event.attendees.length} attendee(s)`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const days = parseInt(process.argv[2]) || 1;
checkCalendar(days);
