#!/usr/bin/env node

const fs = require('fs');
const {google} = require('googleapis');

const TOKEN_PATH = require('path').join(process.env.HOME, '.openclaw', 'google-token.json');

async function checkInbox(maxResults = 5) {
  try {
    const auth = google.auth.fromJSON(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    const gmail = google.gmail({version: 'v1', auth});

    // Get unread messages
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
      q: 'is:unread'
    });

    if (!res.data.messages || res.data.messages.length === 0) {
      console.log('📬 No unread messages');
      return;
    }

    console.log(`📧 ${res.data.resultSizeEstimate} unread messages\n`);
    console.log('Most recent:\n');

    // Get details for each message
    for (const message of res.data.messages) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const headers = msg.data.payload.headers;
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      console.log(`Date: ${date}`);
      console.log('---');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const limit = parseInt(process.argv[2]) || 5;
checkInbox(limit);
