#!/usr/bin/env node

/**
 * Gemini 2.5 Flash API Client
 * Central AI engine for the sales agent system
 * Supports web grounding for real-time research
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const REQUEST_DELAY_MS = 4000; // 15 req/min = 4s between requests
let lastRequestTime = 0;

async function rateLimitWait() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Generate text response from Gemini
 */
async function generateText(prompt, systemInstruction = '') {
  await rateLimitWait();

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    }
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      console.error('Gemini API error:', data.error.message);
      return null;
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error('Gemini request failed:', error.message);
    return null;
  }
}

/**
 * Generate structured JSON response from Gemini
 */
async function generateJSON(prompt, systemInstruction = '') {
  await rateLimitWait();

  const body = {
    contents: [{ parts: [{ text: prompt + '\n\nRespond ONLY with valid JSON. No markdown, no code fences.' }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json'
    }
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      console.error('Gemini API error:', data.error.message);
      return null;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Parse JSON, handling potential markdown wrapping
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Gemini JSON request failed:', error.message);
    return null;
  }
}

/**
 * Search the web via Gemini's grounding capability
 * Returns grounded text with real-time web data
 */
async function searchWeb(query, systemInstruction = '') {
  await rateLimitWait();

  const body = {
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192
    }
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      console.error('Gemini search error:', data.error.message);
      return null;
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error('Gemini search failed:', error.message);
    return null;
  }
}

/**
 * Search web and return structured JSON
 */
async function searchWebJSON(query, systemInstruction = '') {
  const text = await searchWeb(query, systemInstruction);
  if (!text) return null;

  // Use Gemini to extract JSON from the grounded response
  const jsonResult = await generateJSON(
    `Extract the following information from this research and return as JSON:\n\n${text}\n\nReturn the data as a clean JSON array/object.`,
    systemInstruction
  );

  return jsonResult;
}

module.exports = {
  generateText,
  generateJSON,
  searchWeb,
  searchWebJSON
};
