#!/usr/bin/env node

/**
 * Prospect Research - Real Company Discovery
 * Uses Gemini web grounding to find actual companies
 */

const fs = require('fs');
const path = require('path');
const { searchWeb, generateJSON } = require('./lib/ai_client');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Verify a company website is real by fetching it
 */
async function verifyWebsite(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow'
    });
    clearTimeout(timeout);
    return response.ok || response.status === 403;
  } catch {
    return false;
  }
}

/**
 * Research real companies matching the ICP
 */
async function researchProspects(config) {
  const { industry, companySize, painPoints, prospectCount, specificCompanies } = config;
  const count = Math.min(prospectCount || 15, 50);

  console.log(`🔍 Researching ${count} real ${industry} companies (${companySize} employees)...`);

  // Load market analysis for context
  let marketContext = '';
  const marketFile = path.join(DATA_DIR, 'market_analysis.json');
  if (fs.existsSync(marketFile)) {
    const market = JSON.parse(fs.readFileSync(marketFile, 'utf8'));
    if (market.analysis?.painPoints) {
      marketContext = `Key pain points in this market: ${market.analysis.painPoints.join(', ')}`;
    }
  }

  const painPointContext = painPoints === 'auto'
    ? `Focus on companies that likely need customer support automation. ${marketContext}`
    : `Target companies with these pain points: ${painPoints}`;

  // Search in batches of 10
  const batchSize = Math.min(count, 10);
  const batches = Math.ceil(count / batchSize);
  let allProspects = [];

  for (let batch = 0; batch < batches; batch++) {
    const remaining = count - allProspects.length;
    const batchCount = Math.min(batchSize, remaining);

    const excludeList = allProspects.map(p => p.name).join(', ');
    const excludeClause = excludeList ? `Do NOT include these companies (already found): ${excludeList}` : '';

    console.log(`  Batch ${batch + 1}/${batches}: Finding ${batchCount} companies...`);

    const query = `Find ${batchCount} real ${industry} companies with approximately ${companySize} employees that would benefit from an AI voice agent for customer support.

${painPointContext}

${excludeClause}

For each company, provide:
1. Company name (must be a real, currently operating company)
2. Website URL (must be a real, working URL)
3. What the company does (1 sentence)
4. Approximate employee count
5. Headquarters location
6. Why they would need voice AI for customer support
7. Any recent news (funding, growth, product launches)

Only include real companies that exist today. Do not fabricate companies.`;

    const result = await searchWeb(query);
    if (!result) continue;

    const parsed = await generateJSON(
      `Extract company data from this research into a JSON array:

${result}

Return a JSON array where each element has:
{
  "name": "Company Name",
  "website": "https://...",
  "description": "What they do",
  "employeeCount": "approximate number or range",
  "location": "City, Country",
  "whyNeedVoiceAI": "Why they need it",
  "recentNews": "Any recent news or null"
}`
    );

    if (parsed) {
      // OpenAI json_object mode always returns an object, extract the array
      const companies = Array.isArray(parsed) ? parsed : Object.values(parsed).find(v => Array.isArray(v)) || [];
      allProspects.push(...companies);
    }
  }

  // Add specific companies if provided
  if (specificCompanies?.length) {
    for (const company of specificCompanies) {
      console.log(`  Researching specific company: ${company}...`);
      const query = `Tell me about ${company}. What do they do? Website URL? Employee count? Location? Why might they need AI voice agents for customer support?`;
      const result = await searchWeb(query);
      if (result) {
        const parsed = await generateJSON(
          `Extract company data:
${result}
Return JSON: { "name": "", "website": "", "description": "", "employeeCount": "", "location": "", "whyNeedVoiceAI": "", "recentNews": "" }`
        );
        if (parsed && parsed.name) {
          allProspects.push(parsed);
        }
      }
    }
  }

  // Validate websites
  console.log(`\n🔗 Validating ${allProspects.length} company websites...`);
  const validated = [];
  for (const prospect of allProspects) {
    if (!prospect.website) continue;

    let url = prospect.website;
    if (!url.startsWith('http')) url = 'https://' + url;
    prospect.website = url;

    const isReal = await verifyWebsite(url);
    if (isReal) {
      prospect.verified = true;
      validated.push(prospect);
      console.log(`  ✅ ${prospect.name} - ${url}`);
    } else {
      console.log(`  ❌ ${prospect.name} - ${url} (not reachable, skipping)`);
    }
  }

  // Score prospects
  const scored = validated.map((p, i) => ({
    ...p,
    id: `prospect-${Date.now()}-${i}`,
    fitScore: calculateFitScore(p, config),
    researchedAt: new Date().toISOString()
  }));

  scored.sort((a, b) => b.fitScore - a.fitScore);

  // Save results
  fs.writeFileSync(path.join(DATA_DIR, 'qualified_prospects.json'), JSON.stringify(scored, null, 2));

  console.log(`\n✅ Found ${scored.length} verified prospects`);
  return scored;
}

function calculateFitScore(prospect, config) {
  let score = 50;

  const empStr = String(prospect.employeeCount || '');
  const empNum = parseInt(empStr.replace(/[^0-9]/g, '')) || 0;
  const sizeRange = config.companySize || '';
  if (sizeRange.includes('-')) {
    const [min, max] = sizeRange.split('-').map(Number);
    if (empNum >= min && empNum <= max) score += 20;
    else if (empNum > 0) score += 10;
  } else {
    score += 10;
  }

  if (prospect.recentNews && prospect.recentNews !== 'null' && prospect.recentNews !== null) {
    score += 15;
  }

  if (prospect.whyNeedVoiceAI && prospect.whyNeedVoiceAI.length > 20) {
    score += 15;
  }

  return Math.min(score, 100);
}

function formatForSlack(prospects) {
  let msg = `🔍 *Found ${prospects.length} Real Prospects:*\n\n`;

  prospects.forEach((p, i) => {
    msg += `*${i + 1}. ${p.name}* (Score: ${p.fitScore}/100)\n`;
    msg += `   🌐 ${p.website}\n`;
    msg += `   📝 ${p.description || 'N/A'}\n`;
    msg += `   👥 ${p.employeeCount || 'Unknown'} employees | 📍 ${p.location || 'Unknown'}\n`;
    if (p.recentNews && p.recentNews !== 'null' && p.recentNews !== null) {
      msg += `   📰 ${p.recentNews}\n`;
    }
    msg += '\n';
  });

  return msg;
}

module.exports = { researchProspects, formatForSlack };

if (require.main === module) {
  const configFile = path.join(DATA_DIR, 'campaign_config.json');
  if (fs.existsSync(configFile)) {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    researchProspects(config).then(prospects => {
      console.log('\n' + formatForSlack(prospects));
    });
  } else {
    console.log('No campaign config found. Run from Slack bot.');
  }
}
