#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const TOKEN_PATH = path.join(process.env.HOME, '.openclaw', 'google-token.json');
const CREDENTIALS_PATH = path.join(process.env.HOME, '.openclaw', 'gmail-credentials.json');

async function loadSavedCredentials() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
  console.log('✅ Token saved to:', TOKEN_PATH);
}

async function authorize() {
  let client = await loadSavedCredentials();
  if (client) {
    console.log('✅ Using existing credentials');
    return client;
  }

  console.log('🔐 Opening browser for authorization...');
  console.log('Please allow access when prompted.\n');

  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}

async function testGmail(auth) {
  const gmail = google.gmail({version: 'v1', auth});
  const res = await gmail.users.labels.list({userId: 'me'});

  console.log('\n📧 Gmail Access Test:');
  console.log('   ✅ Connected successfully');
  console.log(`   Found ${res.data.labels.length} labels`);

  // Get unread count
  const unreadRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread'
  });

  const unreadCount = unreadRes.data.resultSizeEstimate || 0;
  console.log(`   📬 ${unreadCount} unread messages`);
}

async function testCalendar(auth) {
  const calendar = google.calendar({version: 'v3', auth});
  const res = await calendar.calendarList.list();

  console.log('\n📅 Calendar Access Test:');
  console.log('   ✅ Connected successfully');
  console.log(`   Found ${res.data.items.length} calendars`);

  const primary = res.data.items.find(cal => cal.primary);
  if (primary) {
    console.log(`   Primary: ${primary.summary}`);
  }

  // Get today's events
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59);

  const events = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const eventCount = events.data.items?.length || 0;
  console.log(`   📆 ${eventCount} events today`);
}

async function main() {
  console.log('🚀 Google OAuth Authorization for OpenClaw\n');
  console.log('This will connect Gmail and Google Calendar.\n');

  try {
    const auth = await authorize();
    await testGmail(auth);
    await testCalendar(auth);

    console.log('\n✨ Authorization Complete!');
    console.log('\nYou can now:');
    console.log('  • Check email via OpenClaw');
    console.log('  • Manage calendar events');
    console.log('  • Get daily briefings\n');
    console.log('Try: @Terrrorizer AI check my inbox\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Make sure gmail-credentials.json exists');
    console.error('  2. Check you added your email as a test user in Google Cloud');
    console.error('  3. Enable Gmail and Calendar APIs in Google Cloud Console\n');
    process.exit(1);
  }
}

main();
