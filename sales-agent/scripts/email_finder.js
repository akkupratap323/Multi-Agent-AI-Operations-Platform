#!/usr/bin/env node

/**
 * Email Finder - Real Decision Maker Email Discovery
 * Multi-strategy: Gemini web search → Website scraping → Pattern + MX verification
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { promisify } = require('util');
const { searchWeb, generateJSON } = require('./lib/ai_client');

const resolveMx = promisify(dns.resolveMx);
const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Extract emails from a webpage
 */
async function scrapeEmailsFromPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      redirect: 'follow'
    });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const html = await response.text();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const found = [...new Set(html.match(emailRegex) || [])];

    // Filter out generic/system emails
    const genericPatterns = ['noreply', 'no-reply', 'unsubscribe', 'mailer-daemon', 'postmaster', 'webmaster', 'example.com', 'sentry.io', 'wixpress'];
    return found.filter(email => {
      const lower = email.toLowerCase();
      return !genericPatterns.some(p => lower.includes(p)) && !lower.endsWith('.png') && !lower.endsWith('.jpg');
    });
  } catch {
    return [];
  }
}

/**
 * Verify domain has MX records (can receive email)
 */
async function verifyDomainMX(domain) {
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Extract domain from URL
 */
function getDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

/**
 * Find decision maker and their email for a company
 */
async function findContactForCompany(prospect) {
  const { name, website, description } = prospect;
  const domain = getDomain(website);
  let bestContact = {
    name: null,
    title: null,
    email: null,
    confidence: 0,
    source: 'none'
  };

  console.log(`  🔍 Finding contact for ${name}...`);

  // Strategy 1: Gemini web search for decision maker + email
  const searchResult = await searchWeb(
    `Who is the CEO, founder, or head of customer experience at ${name} (${website})? What is their email address? Check their LinkedIn, company website contact page, Crunchbase, and press releases.`
  );

  if (searchResult) {
    const parsed = await generateJSON(
      `From this research about ${name}, extract the decision maker's contact info:

${searchResult}

Return JSON:
{
  "name": "Full Name or null",
  "title": "Job Title or null",
  "email": "email@domain.com or null",
  "linkedIn": "LinkedIn URL or null"
}`
    );

    if (parsed) {
      if (parsed.email && parsed.email.includes('@') && !parsed.email.includes('example')) {
        bestContact = { ...parsed, confidence: 85, source: 'web_search' };
        console.log(`    ✅ Found via web search: ${parsed.name} <${parsed.email}>`);
        return bestContact;
      }
      if (parsed.name) {
        bestContact.name = parsed.name;
        bestContact.title = parsed.title;
      }
    }
  }

  // Strategy 2: Scrape company website for emails
  const pagesToCheck = [
    website,
    website.replace(/\/$/, '') + '/contact',
    website.replace(/\/$/, '') + '/about',
    website.replace(/\/$/, '') + '/team',
    website.replace(/\/$/, '') + '/about-us',
    website.replace(/\/$/, '') + '/contact-us'
  ];

  let foundEmails = [];
  for (const pageUrl of pagesToCheck) {
    const emails = await scrapeEmailsFromPage(pageUrl);
    foundEmails.push(...emails);
  }
  foundEmails = [...new Set(foundEmails)];

  // Filter: prefer personal emails over generic ones
  const personalEmails = foundEmails.filter(e => {
    const local = e.split('@')[0].toLowerCase();
    return !['info', 'hello', 'contact', 'support', 'sales', 'admin', 'team', 'general', 'office', 'hr'].includes(local);
  });

  const genericEmails = foundEmails.filter(e => {
    const local = e.split('@')[0].toLowerCase();
    return ['info', 'hello', 'contact', 'sales'].includes(local);
  });

  if (personalEmails.length > 0) {
    const email = personalEmails[0];
    bestContact.email = email;
    bestContact.confidence = 80;
    bestContact.source = 'website_scrape';
    // Try to match the name from the email
    if (!bestContact.name) {
      const local = email.split('@')[0];
      const parts = local.split(/[._-]/);
      if (parts.length >= 2) {
        bestContact.name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      }
    }
    console.log(`    ✅ Found personal email on website: ${email}`);
    return bestContact;
  }

  // Strategy 3: Pattern generation + MX verification
  const hasMX = await verifyDomainMX(domain);

  if (hasMX && bestContact.name) {
    // Generate email patterns from the discovered name
    const nameParts = bestContact.name.toLowerCase().split(' ');
    const first = nameParts[0] || '';
    const last = nameParts[nameParts.length - 1] || '';

    if (first && last) {
      const patterns = [
        `${first}.${last}@${domain}`,
        `${first}@${domain}`,
        `${first[0]}${last}@${domain}`,
        `${first}${last[0]}@${domain}`
      ];

      bestContact.email = patterns[0]; // first.last is most common
      bestContact.confidence = 50;
      bestContact.source = 'pattern_mx_verified';
      console.log(`    📧 Pattern-generated (MX verified): ${patterns[0]}`);
      return bestContact;
    }
  }

  // Strategy 4: Fall back to generic email if available
  if (genericEmails.length > 0) {
    bestContact.email = genericEmails[0];
    bestContact.confidence = 30;
    bestContact.source = 'generic_website';
    bestContact.name = bestContact.name || null;
    console.log(`    📧 Generic email found: ${genericEmails[0]}`);
    return bestContact;
  }

  // Strategy 5: Last resort - common generic patterns with MX check
  if (hasMX) {
    bestContact.email = `hello@${domain}`;
    bestContact.confidence = 20;
    bestContact.source = 'generic_pattern';
    console.log(`    ⚠️ Using generic pattern: hello@${domain}`);
    return bestContact;
  }

  console.log(`    ❌ No email found for ${name}`);
  return bestContact;
}

/**
 * Find emails for all prospects
 */
async function findEmails() {
  const prospectsFile = path.join(DATA_DIR, 'qualified_prospects.json');

  if (!fs.existsSync(prospectsFile)) {
    console.error('❌ No prospects found. Run research_prospects.js first.');
    return [];
  }

  const prospects = JSON.parse(fs.readFileSync(prospectsFile, 'utf8'));
  console.log(`📧 Finding emails for ${prospects.length} prospects...\n`);

  const results = [];
  for (const prospect of prospects) {
    const contact = await findContactForCompany(prospect);

    results.push({
      ...prospect,
      contactName: contact.name,
      contactTitle: contact.title,
      contactEmail: contact.email,
      emailConfidence: contact.confidence,
      emailSource: contact.source,
      linkedIn: contact.linkedIn || null
    });
  }

  // Sort by email confidence
  results.sort((a, b) => b.emailConfidence - a.emailConfidence);

  // Save results
  const outputFile = path.join(DATA_DIR, 'prospects_with_emails.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  // Stats
  const withEmail = results.filter(r => r.contactEmail);
  const highConf = results.filter(r => r.emailConfidence >= 70);
  const withName = results.filter(r => r.contactName);

  console.log(`\n📊 Email Discovery Results:`);
  console.log(`  Total prospects: ${results.length}`);
  console.log(`  With emails: ${withEmail.length}`);
  console.log(`  High confidence (≥70%): ${highConf.length}`);
  console.log(`  With real names: ${withName.length}`);
  console.log(`\n✅ Saved to prospects_with_emails.json`);

  return results;
}

function formatForSlack(prospects) {
  let msg = `📧 *Email Discovery Results:*\n\n`;

  const withEmail = prospects.filter(p => p.contactEmail);
  msg += `Found emails for ${withEmail.length}/${prospects.length} prospects\n\n`;

  prospects.forEach((p, i) => {
    const conf = p.emailConfidence >= 70 ? '🟢' : p.emailConfidence >= 40 ? '🟡' : '🔴';
    msg += `*${i + 1}. ${p.name}*\n`;
    msg += `   👤 ${p.contactName || 'Unknown'} ${p.contactTitle ? `(${p.contactTitle})` : ''}\n`;
    msg += `   📧 ${p.contactEmail || 'Not found'} ${conf} ${p.emailConfidence}%\n`;
    msg += `   🔍 Source: ${p.emailSource}\n\n`;
  });

  return msg;
}

module.exports = { findEmails, formatForSlack };

if (require.main === module) {
  findEmails().then(results => {
    console.log('\n' + formatForSlack(results));
  });
}
