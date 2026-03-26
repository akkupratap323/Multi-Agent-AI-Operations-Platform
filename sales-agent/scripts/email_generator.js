#!/usr/bin/env node

/**
 * AI-Powered Email Generator
 * Uses Gemini to write truly personalized cold emails
 */

const fs = require('fs');
const path = require('path');
const { generateText, generateJSON } = require('./lib/ai_client');

const DATA_DIR = path.join(__dirname, '..', 'data');

const SYSTEM_PROMPT = `You are writing a cold email on behalf of Aditya from Nester Labs.

Product: Nester Voice AI - a conversational AI that handles customer support calls 24/7.
It reduces support costs by 60%, responds instantly, works in multiple languages, and never sleeps.

Rules for the email:
- Be genuinely personalized (reference real things about the company)
- Keep the body under 150 words
- Don't be pushy or salesy
- Use a conversational, human tone
- Include a soft CTA (suggest a quick chat, not a hard demo push)
- Don't use buzzwords like "synergy", "leverage", "game-changer"
- Don't use exclamation marks excessively
- The subject line should be under 60 characters and feel personal
- Sign off as: Aditya, Nester Labs
- Do NOT include any placeholder brackets like [Company] or [Name]`;

/**
 * Generate a personalized email for one prospect
 */
async function generateEmailForProspect(prospect, marketAnalysis) {
  const { name, description, contactName, contactTitle, contactEmail, whyNeedVoiceAI, recentNews, employeeCount, location } = prospect;

  const recipientName = contactName || 'there';
  const recipientGreeting = contactName ? contactName.split(' ')[0] : 'Hi there';

  // Build context about the prospect
  let context = `Company: ${name}\n`;
  context += `What they do: ${description || 'N/A'}\n`;
  context += `Recipient: ${recipientName}${contactTitle ? ` (${contactTitle})` : ''}\n`;
  context += `Employee count: ${employeeCount || 'Unknown'}\n`;
  context += `Location: ${location || 'Unknown'}\n`;

  if (whyNeedVoiceAI) {
    context += `Why they need voice AI: ${whyNeedVoiceAI}\n`;
  }
  if (recentNews && recentNews !== 'null' && recentNews !== null) {
    context += `Recent news: ${recentNews}\n`;
  }

  // Add market insights
  if (marketAnalysis?.analysis) {
    const ma = marketAnalysis.analysis;
    if (ma.messagingAngles?.length) {
      context += `Best messaging angle: ${ma.messagingAngles[0]}\n`;
    }
    if (ma.painPoints?.length) {
      context += `Industry pain points: ${ma.painPoints.slice(0, 3).join(', ')}\n`;
    }
  }

  const prompt = `Write a cold email to ${recipientGreeting} at ${name}.

Context about the prospect:
${context}

Write ONE email with a subject line and body. The greeting should address ${recipientGreeting} naturally.
Make it genuinely personalized based on what you know about ${name}.

Format your response exactly as:
Subject: [subject line]

[email body including greeting and sign-off]`;

  const emailText = await generateText(prompt, SYSTEM_PROMPT);

  if (!emailText) {
    console.error(`  ❌ Failed to generate email for ${name}`);
    return null;
  }

  // Parse subject and body
  const lines = emailText.trim().split('\n');
  let subject = '';
  let body = '';

  const subjectLine = lines.find(l => l.toLowerCase().startsWith('subject:'));
  if (subjectLine) {
    subject = subjectLine.replace(/^subject:\s*/i, '').trim();
    const subjectIndex = lines.indexOf(subjectLine);
    body = lines.slice(subjectIndex + 1).join('\n').trim();
  } else {
    subject = `Quick question about ${name}`;
    body = emailText.trim();
  }

  // Clean up body - remove any markdown
  body = body.replace(/\*\*/g, '').replace(/^---+$/gm, '').trim();

  return {
    to: contactEmail,
    recipientName: contactName,
    recipientTitle: contactTitle,
    company: name,
    subject,
    body,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Generate emails for all prospects with emails
 */
async function generateEmails() {
  const prospectsFile = path.join(DATA_DIR, 'prospects_with_emails.json');

  if (!fs.existsSync(prospectsFile)) {
    console.error('❌ No prospects with emails found. Run email_finder.js first.');
    return [];
  }

  const prospects = JSON.parse(fs.readFileSync(prospectsFile, 'utf8'));
  const withEmail = prospects.filter(p => p.contactEmail);

  if (withEmail.length === 0) {
    console.error('❌ No prospects have email addresses.');
    return [];
  }

  // Load market analysis for context
  let marketAnalysis = null;
  const marketFile = path.join(DATA_DIR, 'market_analysis.json');
  if (fs.existsSync(marketFile)) {
    marketAnalysis = JSON.parse(fs.readFileSync(marketFile, 'utf8'));
  }

  console.log(`✍️ Generating personalized emails for ${withEmail.length} prospects...\n`);

  const emails = [];
  for (let i = 0; i < withEmail.length; i++) {
    const prospect = withEmail[i];
    console.log(`  ${i + 1}/${withEmail.length}: Writing email for ${prospect.name}...`);

    const email = await generateEmailForProspect(prospect, marketAnalysis);
    if (email) {
      emails.push(email);
      console.log(`    ✅ Subject: "${email.subject}"`);
    }
  }

  // Save generated emails
  fs.writeFileSync(path.join(DATA_DIR, 'generated_emails.json'), JSON.stringify(emails, null, 2));

  // Save human-readable version
  let readable = `GENERATED COLD EMAILS\n${'='.repeat(60)}\n`;
  readable += `Generated: ${new Date().toLocaleString()}\n`;
  readable += `Total: ${emails.length} emails\n\n`;

  emails.forEach((email, i) => {
    readable += `${'─'.repeat(60)}\n`;
    readable += `EMAIL ${i + 1}/${emails.length}\n`;
    readable += `To: ${email.recipientName || 'N/A'} <${email.to}>\n`;
    readable += `Company: ${email.company}\n`;
    readable += `Subject: ${email.subject}\n\n`;
    readable += `${email.body}\n\n`;
  });

  fs.writeFileSync(path.join(DATA_DIR, 'emails_readable.txt'), readable);

  console.log(`\n✅ Generated ${emails.length} personalized emails`);
  return emails;
}

function formatPreviewsForSlack(emails, count = 3) {
  let msg = '';
  const previewCount = Math.min(count, emails.length);

  for (let i = 0; i < previewCount; i++) {
    const e = emails[i];
    msg += `📧 *Email ${i + 1}/${emails.length}*\n\n`;
    msg += `*To:* ${e.recipientName || 'N/A'} <${e.to}>\n`;
    msg += `*Company:* ${e.company}\n`;
    msg += `*Subject:* ${e.subject}\n\n`;
    msg += `${e.body.substring(0, 400)}${e.body.length > 400 ? '...' : ''}\n\n`;
    msg += `${'━'.repeat(40)}\n\n`;
  }

  return msg;
}

module.exports = { generateEmails, formatPreviewsForSlack };

if (require.main === module) {
  generateEmails().then(emails => {
    if (emails.length > 0) {
      console.log('\n' + formatPreviewsForSlack(emails));
    }
  });
}
