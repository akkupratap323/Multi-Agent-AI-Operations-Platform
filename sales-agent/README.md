# Nester Voice AI - Intelligent Cold Email Sales Agent

An intelligent sales automation system that researches prospects, finds contact information, and sends highly personalized, humanized cold emails that don't sound like spam.

## 🎯 What It Does

1. **Researches Target Customers** - Identifies companies that would benefit from Nester Voice AI based on industry, size, tech stack, and pain points
2. **Finds Decision Maker Emails** - Uses multiple strategies (Hunter.io, Apollo.io, pattern matching) to find the right contacts
3. **Generates Personalized Emails** - Creates humanized, non-spammy emails with company-specific details and genuine value propositions
4. **Sends & Tracks** - Sends emails with rate limiting and tracks opens, clicks, and replies

## 📁 Project Structure

```
sales-agent/
├── scripts/
│   ├── research_prospects.js      # Stage 1: Find potential customers
│   ├── email_finder.js            # Stage 2: Find decision maker emails
│   ├── email_generator.js         # Stage 3: Generate personalized emails
│   ├── email_sender.js            # Stage 4: Send emails with tracking
│   └── run_campaign.js            # Orchestrator - runs all stages
├── data/                          # Generated data (gitignored)
│   ├── qualified_prospects.json
│   ├── prospects_with_emails.json
│   ├── generated_emails.json
│   └── campaign_report_*.json
├── templates/                     # Email templates
└── README.md
```

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (v16+)
2. **npm** packages: `pg`, `nodemailer`
3. **Email Account** (Gmail recommended)
4. **Optional**: API keys for Hunter.io, Apollo.io

### Installation

```bash
cd /Users/apple/.openclaw/sales-agent
npm install pg nodemailer
```

### Configuration

#### 1. Email Credentials (Required)

For Gmail:
```bash
export SMTP_USER="your-email@gmail.com"
export SMTP_PASS="your-app-password"
```

**Get Gmail App Password:**
1. Go to Google Account settings
2. Security → 2-Step Verification → App passwords
3. Generate new app password
4. Copy the 16-character password

#### 2. Email Finder APIs (Optional but Recommended)

```bash
# Hunter.io - Find emails
export HUNTER_API_KEY="your-hunter-api-key"

# Apollo.io - Contact database
export APOLLO_API_KEY="your-apollo-api-key"
```

**Get API Keys:**
- Hunter.io: https://hunter.io/api (50 free searches/month)
- Apollo.io: https://apollo.io/api (limited free tier)

### Running the Campaign

#### Full Campaign (All Stages)

```bash
node scripts/run_campaign.js
```

#### Dry Run (Test Without Sending)

```bash
node scripts/run_campaign.js --dry-run
```

#### Run Individual Stages

```bash
# Stage 1: Research prospects
node scripts/research_prospects.js

# Stage 2: Find emails
node scripts/email_finder.js

# Stage 3: Generate emails
node scripts/email_generator.js

# Stage 4: Send emails
node scripts/email_sender.js
```

#### Skip Stages (Use Existing Data)

```bash
# Skip research, use existing prospects
node scripts/run_campaign.js --skip-research

# Only send emails (all data exists)
node scripts/run_campaign.js --skip-research --skip-email-finding --skip-email-generation
```

## 📧 Email Templates

The system uses multiple humanized templates that rotate to avoid spam filters:

### Template Types

1. **Problem-Agitate-Solve** - Addresses pain points directly
2. **Value-First** - Leads with customer results
3. **Curiosity Hook** - Asks engaging questions
4. **Pattern Interrupt** - Breaks typical sales email patterns

### Personalization Variables

Each email is personalized with:
- Recipient's first name
- Company name and details
- Industry-specific use cases
- Growth signals (funding, hiring, etc.)
- Specific pain points
- Social proof relevant to their industry

### Example Email

```
Subject: Quick question about CloudFlow's customer support

Hi John,

I noticed CloudFlow is recently raising funding. Congrats on the momentum!

I'm reaching out because I've been working with SaaS companies like yours,
and I keep hearing the same challenge: keeping up with customer support
as they scale.

We built Nester Voice AI specifically to solve this. It's a conversational
AI that handles customer calls 24/7 - think of it like having a support
agent who never sleeps, never gets overwhelmed, and costs a fraction of hiring.

Here's what it can do for CloudFlow:
• Answer common questions instantly (no wait times)
• Qualify leads before they reach your team
• Handle basic inquiries automatically
• Work seamlessly with your existing tools

Companies using Nester are seeing 60% fewer support tickets and 90%
faster response times.

Would you be open to a quick 15-min chat to see if this could help
CloudFlow? I can show you a demo tailored to your use case.

Best,
Aditya
Founder, Nester Labs

P.S. No pressure at all - if the timing isn't right, I totally understand.
Just thought it might be helpful given your growth.
```

## 🎯 Target Customer Profiles

The system targets these industries:

### 1. SaaS Companies (10-200 employees)
- **Use Case**: Customer support automation, lead qualification
- **Pain Points**: High support costs, long response times
- **Keywords**: customer support, helpdesk, B2B software

### 2. E-commerce (20-500 employees)
- **Use Case**: Order tracking, customer inquiries, returns
- **Pain Points**: High call volume, repetitive questions
- **Keywords**: online store, e-commerce, retail

### 3. Healthcare (5-100 employees)
- **Use Case**: Appointment scheduling, patient reminders
- **Pain Points**: Missed appointments, admin overhead
- **Keywords**: clinic, medical practice, dental

### 4. Real Estate (3-50 employees)
- **Use Case**: Lead qualification, property inquiries
- **Pain Points**: Lead response time, scheduling
- **Keywords**: real estate, property management

### 5. Financial Services (10-200 employees)
- **Use Case**: Account inquiries, FAQ handling
- **Pain Points**: Compliance, high call volumes
- **Keywords**: financial advisory, accounting, insurance

## 📊 Campaign Settings

### Rate Limiting
- **Daily Send Limit**: 50 emails (customizable)
- **Delay Between Sends**: 5 seconds
- **Reason**: Stay below spam thresholds, maintain sender reputation

### Email Quality Checks
- Valid email format verification
- Domain validation
- Confidence scoring (50+ recommended)
- Duplicate detection

## 📈 Tracking & Analytics

### Campaign Reports

Each campaign generates:
- `campaign_report_YYYY-MM-DD.json` - Summary stats
- `send_results_YYYY-MM-DD.json` - Detailed send logs
- `emails_readable.txt` - Human-readable email preview

### Metrics Tracked

- Total sent / failed
- Success rate
- Remaining emails for next day
- Tracking IDs for each email
- Timestamps

### Email Tracking (Optional)

Set up tracking server for:
- **Open tracking** - Via 1x1 pixel
- **Click tracking** - Via redirect URLs
- **Reply tracking** - Via email webhooks

## 🛡️ Best Practices

### Email Deliverability

1. **Warm up your email** - Start with 10-20 emails/day, gradually increase
2. **Use authenticated domain** - Set up SPF, DKIM, DMARC
3. **Monitor bounce rate** - Keep below 5%
4. **Clean your list** - Verify emails before sending
5. **Personalize everything** - No generic blasts

### Content Guidelines

1. **Keep it short** - 150-200 words max
2. **Lead with value** - What's in it for them?
3. **One CTA** - Don't overwhelm with multiple asks
4. **Natural language** - Write like a human, not a robot
5. **Soft close** - "No pressure" works better than urgency

### Legal Compliance

- **CAN-SPAM** - Include unsubscribe link, physical address
- **GDPR** - Only email businesses with legitimate interest
- **Don't buy lists** - Only email organically researched prospects

## 🔧 Customization

### Modify Target Industries

Edit `research_prospects.js`:
```javascript
const TARGET_PROFILES = [
  {
    industry: 'Your Industry',
    companySize: '10-200 employees',
    useCase: 'Your use case',
    painPoints: ['Pain 1', 'Pain 2'],
    keywords: ['keyword1', 'keyword2']
  }
];
```

### Add Email Templates

Edit `email_generator.js`:
```javascript
const EMAIL_TEMPLATES = {
  your_template_name: [
    {
      subject: "Your subject with {variables}",
      body: `Your email body with {variables}`
    }
  ]
};
```

### Change Sender Details

Edit `email_generator.js`:
```javascript
senderName: 'Your Name',
senderTitle: 'Your Title',
senderEmail: 'your@email.com',
```

## 🐛 Troubleshooting

### "No prospects file found"
**Solution**: Run `research_prospects.js` first

### "Email credentials not configured"
**Solution**: Set `SMTP_USER` and `SMTP_PASS` environment variables

### "SMTP Authentication failed"
**Solution**:
- For Gmail, use App Password (not regular password)
- Enable 2-factor authentication first
- Generate new app password

### "No emails found"
**Solution**:
- Add Hunter.io or Apollo.io API keys
- System will fall back to pattern matching

### Emails going to spam
**Solution**:
- Warm up your email account
- Set up SPF/DKIM/DMARC
- Improve email content (less sales-y)
- Reduce send volume

## 📚 Data Integration

### Replace Mock Data with Real APIs

#### LinkedIn Sales Navigator
```javascript
// In research_prospects.js
async function fetchLinkedInCompanies(industry) {
  // Use LinkedIn API or scraper
}
```

#### Clearbit/ZoomInfo
```javascript
// Get company data
const company = await clearbit.Company.find({domain: 'example.com'});
```

#### Google Search API
```javascript
// Find recent news, funding announcements
const news = await googleSearch(`${companyName} funding news`);
```

## 🎯 Next Steps After Campaign

1. **Monitor Replies** - Check inbox for responses
2. **Track Metrics** - Review campaign reports
3. **Follow Up** - Send follow-ups to non-responders (7 days later)
4. **A/B Test** - Try different templates, subjects
5. **Refine Targeting** - Focus on industries with best response
6. **Scale Gradually** - Increase volume as sender reputation improves

## 📝 Environment Variables Reference

```bash
# Email Sending (Required)
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-16-char-app-password"

# Email Provider (Optional, defaults to gmail)
EMAIL_PROVIDER="gmail"  # or "smtp", "sendgrid", "mailgun"

# Email Finder APIs (Optional)
HUNTER_API_KEY="your-hunter-key"
APOLLO_API_KEY="your-apollo-key"

# SendGrid (Optional)
SENDGRID_API_KEY="your-sendgrid-key"

# Mailgun (Optional)
MAILGUN_API_KEY="your-mailgun-key"
MAILGUN_DOMAIN="your-domain.com"

# Testing (Optional)
DRY_RUN="true"  # Don't send real emails
```

## 🤝 Support

For issues or questions:
1. Check logs in `data/` directory
2. Review campaign reports
3. Run in dry-run mode first
4. Test with your own email first

## ⚖️ Legal Disclaimer

This tool is for legitimate business outreach only. You are responsible for:
- Complying with anti-spam laws (CAN-SPAM, GDPR, CASL)
- Only emailing businesses with legitimate interest
- Providing unsubscribe options
- Respecting opt-outs

Always get legal advice before running cold email campaigns.

---

**Built for Nester Labs** - Making voice AI accessible to every business.
