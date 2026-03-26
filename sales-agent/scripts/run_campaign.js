#!/usr/bin/env node

/**
 * Campaign Orchestrator - Run the complete cold email pipeline
 *
 * This script runs all stages of the cold outreach campaign:
 * 1. Research prospects
 * 2. Find emails
 * 3. Generate personalized emails
 * 4. Send emails (with rate limiting)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = __dirname;

/**
 * Run a script and wait for completion
 */
function runScript(scriptName, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 Stage: ${description}`);
    console.log(`${'='.repeat(80)}\n`);

    const scriptPath = path.join(scriptsDir, scriptName);
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: scriptsDir
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${description} completed successfully`);
        resolve();
      } else {
        reject(new Error(`${description} failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Check if previous stage data exists
 */
function checkDataExists(filename, stageName) {
  const dataPath = path.join(scriptsDir, '../data', filename);
  if (fs.existsSync(dataPath)) {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`   Found existing data: ${data.length} items from ${stageName}`);
    return true;
  }
  return false;
}

/**
 * Main campaign runner
 */
async function runCampaign(options = {}) {
  const {
    skipResearch = false,
    skipEmailFinding = false,
    skipEmailGeneration = false,
    dryRun = false
  } = options;

  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  NESTER VOICE AI - COLD EMAIL CAMPAIGN                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    // Stage 1: Research Prospects
    if (!skipResearch) {
      await runScript('research_prospects.js', 'Research Prospects');
    } else {
      console.log('\n⏭️  Skipping research (using existing data)');
      checkDataExists('qualified_prospects.json', 'research');
    }

    // Stage 2: Find Emails
    if (!skipEmailFinding) {
      await runScript('email_finder.js', 'Find Decision Maker Emails');
    } else {
      console.log('\n⏭️  Skipping email finding (using existing data)');
      checkDataExists('prospects_ready_for_outreach.json', 'email finding');
    }

    // Stage 3: Generate Personalized Emails
    if (!skipEmailGeneration) {
      await runScript('email_generator.js', 'Generate Personalized Emails');
    } else {
      console.log('\n⏭️  Skipping email generation (using existing data)');
      checkDataExists('generated_emails.json', 'email generation');
    }

    // Stage 4: Send Emails
    if (dryRun) {
      console.log('\n🧪 Running in DRY RUN mode - no emails will be sent');
      process.env.DRY_RUN = 'true';
    }
    await runScript('email_sender.js', 'Send Cold Emails');

    // Campaign summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                          CAMPAIGN COMPLETED                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`⏱️  Total time: ${duration}s`);

    // Load final stats
    const dataDir = path.join(scriptsDir, '../data');
    const reportFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('campaign_report_'));

    if (reportFiles.length > 0) {
      const latestReport = reportFiles.sort().reverse()[0];
      const report = JSON.parse(fs.readFileSync(path.join(dataDir, latestReport), 'utf8'));

      console.log('\n📊 Campaign Statistics:');
      console.log(`   ✅ Emails sent: ${report.totalSent}`);
      console.log(`   ❌ Failed: ${report.totalFailed}`);
      console.log(`   📋 Remaining: ${report.remaining}`);
      console.log(`   📈 Success rate: ${((report.totalSent / (report.totalSent + report.totalFailed)) * 100).toFixed(1)}%`);
    }

    console.log('\n🎯 Next Steps:');
    console.log('   1. Monitor your email inbox for replies');
    console.log('   2. Check campaign_report_*.json for tracking data');
    console.log('   3. Follow up with interested prospects');
    console.log('   4. If you have remaining emails, run again tomorrow\n');

  } catch (error) {
    console.error('\n❌ Campaign failed:', error.message);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    skipResearch: args.includes('--skip-research'),
    skipEmailFinding: args.includes('--skip-email-finding'),
    skipEmailGeneration: args.includes('--skip-email-generation'),
    dryRun: args.includes('--dry-run')
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Nester Voice AI - Cold Email Campaign Runner

Usage: node run_campaign.js [options]

Options:
  --skip-research          Skip prospect research (use existing data)
  --skip-email-finding     Skip email finding (use existing data)
  --skip-email-generation  Skip email generation (use existing data)
  --dry-run               Run without sending actual emails
  --help, -h              Show this help message

Examples:
  # Run full campaign
  node run_campaign.js

  # Dry run to test
  node run_campaign.js --dry-run

  # Skip research, use existing prospects
  node run_campaign.js --skip-research

  # Only send emails (assuming data exists)
  node run_campaign.js --skip-research --skip-email-finding --skip-email-generation
`);
    process.exit(0);
  }

  return options;
}

// Run campaign
const options = parseArgs();
runCampaign(options);
