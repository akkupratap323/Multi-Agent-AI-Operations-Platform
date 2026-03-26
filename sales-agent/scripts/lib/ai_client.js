#!/usr/bin/env node

/**
 * OpenAI API Client
 * Central AI engine for the sales agent system
 * Uses GPT-4o-mini for cost-effective, high-quality generation
 * Uses GPT-4o with web search for real-time research
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const REQUEST_DELAY_MS = 500;
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
 * Generate text response from OpenAI
 */
async function generateText(prompt, systemInstruction = '') {
  await rateLimitWait();

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 4096
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenAI API error:', data.error.message);
      return null;
    }

    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('OpenAI request failed:', error.message);
    return null;
  }
}

/**
 * Generate structured JSON response from OpenAI
 */
async function generateJSON(prompt, systemInstruction = '') {
  await rateLimitWait();

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt + '\n\nRespond ONLY with valid JSON. No markdown, no code fences.' });

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        max_tokens: 8192,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenAI API error:', data.error.message);
      return null;
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;

    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    return JSON.parse(cleaned);
  } catch (error) {
    console.error('OpenAI JSON request failed:', error.message);
    return null;
  }
}

/**
 * Search the web via OpenAI Responses API with web_search tool
 * Returns real-time web data
 */
async function searchWeb(query, systemInstruction = '') {
  await rateLimitWait();

  const input = [];
  if (systemInstruction) {
    input.push({ role: 'system', content: systemInstruction });
  }
  input.push({ role: 'user', content: query });

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input,
        temperature: 0.3
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenAI search error:', data.error.message);
      // Fallback: use regular generateText without web search
      console.log('  Falling back to regular generation...');
      return await generateText(query, systemInstruction);
    }

    // Extract text from the response output items
    const outputItems = data.output || [];
    const textItems = outputItems.filter(item => item.type === 'message');
    if (textItems.length > 0) {
      const content = textItems[0].content || [];
      const textParts = content.filter(c => c.type === 'output_text');
      if (textParts.length > 0) {
        return textParts[0].text;
      }
    }

    // Fallback: try to get any text from the response
    if (data.output_text) {
      return data.output_text;
    }

    console.error('No text in search response');
    return await generateText(query, systemInstruction);
  } catch (error) {
    console.error('OpenAI search failed:', error.message);
    return await generateText(query, systemInstruction);
  }
}

/**
 * Search web and return structured JSON
 */
async function searchWebJSON(query, systemInstruction = '') {
  const text = await searchWeb(query, systemInstruction);
  if (!text) return null;

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
