#!/usr/bin/env node

/**
 * LLM utilities for incident diagnosis and postmortem generation
 * Primary: OpenAI o4-mini
 * Fallback: Gemini 2.5 Flash
 */

const config = require('../config');

// ============================================================
// OpenAI (Primary)
// ============================================================

async function callOpenAI(prompt, systemInstruction = '') {
  try {
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanation — just the JSON object.' });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: config.OPENAI_MODEL,
        messages,
        temperature: 0.3,
        max_completion_tokens: 4096
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from OpenAI');

    // Strip markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    return JSON.parse(cleaned);
  } catch (error) {
    console.error('OpenAI call failed:', error.message);
    return null;
  }
}

// ============================================================
// Gemini (Fallback)
// ============================================================

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;

async function callGemini(prompt, systemInstruction = '') {
  try {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');

    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini call failed:', error.message);
    return null;
  }
}

// ============================================================
// Unified LLM caller (OpenAI primary → Gemini fallback)
// ============================================================

async function callLLM(prompt, systemInstruction = '') {
  // Try OpenAI first
  console.log('    LLM: Trying OpenAI o4-mini...');
  const openaiResult = await callOpenAI(prompt, systemInstruction);
  if (openaiResult) {
    console.log('    LLM: OpenAI responded ✓');
    return openaiResult;
  }

  // Fallback to Gemini
  console.log('    LLM: OpenAI failed, falling back to Gemini...');
  const geminiResult = await callGemini(prompt, systemInstruction);
  if (geminiResult) {
    console.log('    LLM: Gemini responded ✓');
    return geminiResult;
  }

  console.error('    LLM: Both OpenAI and Gemini failed');
  return null;
}

// ============================================================
// Incident-specific LLM functions
// ============================================================

async function diagnoseIncident(context) {
  const systemInstruction = `You are an expert AWS DevOps/SRE engineer diagnosing a production incident.
Analyze the provided metrics, logs, and deployment data to identify the root cause.
Return a JSON object with these fields:
- rootCause: string (1-3 sentence explanation of what went wrong)
- confidence: number (0.0 to 1.0)
- affectedServices: string[] (list of potentially affected services)
- suggestedFixes: array of objects with { description: string, command: string, risk: "low"|"medium"|"high" }
  Provide 2-4 fix options ordered from safest to most aggressive.
  Commands should be valid AWS CLI commands.
Only suggest these safe actions: restart, scale up/out, rollback to previous version, clear cache.
NEVER suggest terminating or deleting resources.`;

  const prompt = `INCIDENT CONTEXT:

Service: ${context.serviceType} / ${context.resourceId}
Metric: ${context.metric} = ${context.metricValue} (threshold: ${context.thresholdValue})
Severity: ${context.severity}

CURRENT METRICS:
${JSON.stringify(context.rawMetrics, null, 2)}

RECENT LOGS (last 15 minutes):
${(context.logs || []).map(l => `[${l.timestamp}] ${l.message}`).join('\n') || 'No error logs found'}

RECENT DEPLOYMENTS:
${context.recentDeployments || 'No recent deployments detected'}

RECENT GIT COMMITS:
${context.recentCommits || 'No recent commits found'}

${context.extra ? `ADDITIONAL CONTEXT:\n${JSON.stringify(context.extra, null, 2)}` : ''}

${context.similarIncidents && context.similarIncidents.length > 0 ? `SIMILAR PAST INCIDENTS:\n${context.similarIncidents.slice(0, 3).map(s => `- ${s.incidentNumber}: ${(s.rootCause || '').substring(0, 100)} (MTTR: ${s.mttrSeconds ? Math.round(s.mttrSeconds/60) + 'm' : 'N/A'})`).join('\n')}` : ''}

Analyze this incident and provide your diagnosis.`;

  return await callLLM(prompt, systemInstruction);
}

async function generatePostmortem(incident, timeline) {
  const systemInstruction = `You are an SRE writing an incident postmortem report.
Return a JSON object with these fields:
- summary: string (2-3 sentence executive summary)
- rootCauseAnalysis: string (detailed root cause explanation)
- impact: string (what was affected, estimated user impact)
- whatWentWell: string[] (things that worked during response)
- whatWentWrong: string[] (things that need improvement)
- actionItems: array of objects with { description: string, priority: "high"|"medium"|"low", owner: string }
- lessonsLearned: string[] (key takeaways)`;

  const timelineStr = timeline
    .map(e => `[${new Date(e.created_at).toISOString()}] ${e.event_type}: ${e.description}`)
    .join('\n');

  const prompt = `INCIDENT DATA:

Incident: ${incident.incident_number}
Severity: ${incident.severity}
Service: ${incident.service_type} / ${incident.resource_id}
Metric: ${incident.metric} = ${incident.metric_value} (threshold: ${incident.threshold_value})
Root Cause: ${incident.root_cause}
Confidence: ${incident.confidence}

TIMELINE:
${timelineStr}

MTTR: ${incident.mttr_seconds ? Math.round(incident.mttr_seconds / 60) + ' minutes' : 'N/A'}
Fix Applied: ${incident.approved_fix !== null ? `Fix #${incident.approved_fix + 1}` : 'N/A'}
Approved By: ${incident.approver || 'N/A'}

Detected: ${incident.detected_at}
Resolved: ${incident.resolved_at || 'Not yet resolved'}

Generate a comprehensive postmortem report.`;

  return await callLLM(prompt, systemInstruction);
}

module.exports = { callOpenAI, callGemini, callLLM, diagnoseIncident, generatePostmortem };
