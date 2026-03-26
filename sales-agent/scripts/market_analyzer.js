#!/usr/bin/env node

/**
 * Market Analyzer
 * Uses Gemini with web grounding to analyze target market
 */

const fs = require('fs');
const path = require('path');
const { searchWeb, generateJSON } = require('./lib/ai_client');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function analyzeMarket(icp) {
  const { industry, companySize, painPoints } = icp;

  console.log(`📊 Analyzing market: ${industry} (${companySize} employees)...`);

  const query = `Analyze the market for conversational AI and voice AI solutions targeting ${industry} companies with ${companySize} employees.

Provide a detailed analysis covering:
1. Market overview - how big is the customer support automation market in ${industry}
2. Common pain points ${industry} companies of this size face with customer support
3. What tools/solutions they currently use (Zendesk, Intercom, Freshdesk, etc.)
4. Why they would switch to AI voice agents
5. Decision maker titles who buy this (CEO, CTO, VP Support, etc.)
6. Best messaging angles for cold email outreach selling a voice AI solution
7. Buying signals to look for (hiring support reps, scaling, funding rounds)
8. Average deal size and sales cycle for this segment`;

  const analysis = await searchWeb(query);

  if (!analysis) {
    console.error('❌ Market analysis failed');
    return null;
  }

  // Structure the analysis
  const structured = await generateJSON(
    `Structure this market analysis into JSON format:

${analysis}

Return JSON with these keys:
{
  "marketOverview": "2-3 sentence summary",
  "painPoints": ["pain point 1", "pain point 2", ...],
  "currentSolutions": ["tool 1", "tool 2", ...],
  "whySwitchToAI": ["reason 1", "reason 2", ...],
  "decisionMakers": ["title 1", "title 2", ...],
  "messagingAngles": ["angle 1", "angle 2", ...],
  "buyingSignals": ["signal 1", "signal 2", ...],
  "dealSize": "estimated range",
  "salesCycle": "estimated duration"
}`
  );

  const result = {
    industry,
    companySize,
    analysis: structured || { raw: analysis },
    rawAnalysis: analysis,
    generatedAt: new Date().toISOString()
  };

  // Save to file
  fs.writeFileSync(
    path.join(DATA_DIR, 'market_analysis.json'),
    JSON.stringify(result, null, 2)
  );

  console.log('✅ Market analysis complete');
  return result;
}

/**
 * Format analysis for Slack display
 */
function formatForSlack(result) {
  if (!result || !result.analysis) return 'Market analysis unavailable.';

  const a = result.analysis;
  let msg = `📊 *Market Analysis: ${result.industry} (${result.companySize} employees)*\n\n`;

  if (a.marketOverview) {
    msg += `*Overview:*\n${a.marketOverview}\n\n`;
  }

  if (a.painPoints?.length) {
    msg += `*Key Pain Points:*\n${a.painPoints.map(p => `• ${p}`).join('\n')}\n\n`;
  }

  if (a.currentSolutions?.length) {
    msg += `*Current Solutions They Use:*\n${a.currentSolutions.map(s => `• ${s}`).join('\n')}\n\n`;
  }

  if (a.decisionMakers?.length) {
    msg += `*Decision Makers to Target:*\n${a.decisionMakers.map(d => `• ${d}`).join('\n')}\n\n`;
  }

  if (a.messagingAngles?.length) {
    msg += `*Best Messaging Angles:*\n${a.messagingAngles.map(m => `• ${m}`).join('\n')}\n\n`;
  }

  if (a.buyingSignals?.length) {
    msg += `*Buying Signals:*\n${a.buyingSignals.map(b => `• ${b}`).join('\n')}\n\n`;
  }

  if (a.dealSize) msg += `*Estimated Deal Size:* ${a.dealSize}\n`;
  if (a.salesCycle) msg += `*Sales Cycle:* ${a.salesCycle}\n`;

  return msg;
}

module.exports = { analyzeMarket, formatForSlack };

// Run standalone
if (require.main === module) {
  const configFile = path.join(DATA_DIR, 'campaign_config.json');
  if (fs.existsSync(configFile)) {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    analyzeMarket(config).then(result => {
      console.log('\n' + formatForSlack(result));
    });
  } else {
    console.log('No campaign config found. Run from Slack bot.');
  }
}
