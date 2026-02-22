#!/usr/bin/env node

/**
 * Incident Similarity Engine
 * - Match new incidents to past incidents for faster resolution
 * - Uses LLM for semantic similarity when available
 * - Falls back to metric/service/keyword matching
 * - Surfaces related historical incidents with their fixes
 */

const db = require('./db');
const llm = require('./llm');

/**
 * Find similar past incidents for a new anomaly
 */
async function findSimilar(anomaly, limit = 5) {
  const client = await db.getClient();
  try {
    // Strategy 1: Exact service + metric match
    const exactMatch = await client.query(`
      SELECT *, 'exact' as match_type,
        1.0 as similarity_score
      FROM incidents
      WHERE service_type = $1 AND resource_id = $2 AND metric = $3
      AND status IN ('resolved', 'postmortem_complete')
      ORDER BY detected_at DESC
      LIMIT $4
    `, [anomaly.serviceType, anomaly.resourceId, anomaly.metric, limit]);

    // Strategy 2: Same service, different metric
    const serviceMatch = await client.query(`
      SELECT *, 'service' as match_type,
        0.7 as similarity_score
      FROM incidents
      WHERE service_type = $1 AND resource_id = $2 AND metric != $3
      AND status IN ('resolved', 'postmortem_complete')
      ORDER BY detected_at DESC
      LIMIT $4
    `, [anomaly.serviceType, anomaly.resourceId, anomaly.metric, limit]);

    // Strategy 3: Same metric, different service
    const metricMatch = await client.query(`
      SELECT *, 'metric' as match_type,
        0.5 as similarity_score
      FROM incidents
      WHERE metric = $1 AND (resource_id != $2 OR service_type != $3)
      AND status IN ('resolved', 'postmortem_complete')
      ORDER BY detected_at DESC
      LIMIT $4
    `, [anomaly.metric, anomaly.resourceId, anomaly.serviceType, limit]);

    // Strategy 4: Same severity level
    const severityMatch = await client.query(`
      SELECT *, 'severity' as match_type,
        0.3 as similarity_score
      FROM incidents
      WHERE severity = $1
      AND service_type != $2
      AND status IN ('resolved', 'postmortem_complete')
      ORDER BY detected_at DESC
      LIMIT 3
    `, [anomaly.severity, anomaly.serviceType]);

    await client.end();

    // Combine and deduplicate
    const allMatches = [
      ...exactMatch.rows,
      ...serviceMatch.rows,
      ...metricMatch.rows,
      ...severityMatch.rows
    ];

    const seen = new Set();
    const unique = allMatches.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Sort by similarity score, then recency
    unique.sort((a, b) => {
      if (b.similarity_score !== a.similarity_score) return b.similarity_score - a.similarity_score;
      return new Date(b.detected_at) - new Date(a.detected_at);
    });

    return unique.slice(0, limit).map(m => ({
      incidentNumber: m.incident_number,
      severity: m.severity,
      serviceType: m.service_type,
      resourceId: m.resource_id,
      metric: m.metric,
      rootCause: m.root_cause,
      suggestedFixes: m.suggested_fixes,
      approvedFix: m.approved_fix,
      mttrSeconds: m.mttr_seconds,
      detectedAt: m.detected_at,
      matchType: m.match_type,
      similarityScore: m.similarity_score
    }));

  } catch (e) {
    await client.end();
    return [];
  }
}

/**
 * Use LLM to find the most relevant past incident
 */
async function findSimilarWithLLM(anomaly, pastIncidents) {
  if (pastIncidents.length === 0) return null;

  const prompt = `Given this current incident:
Service: ${anomaly.serviceType}/${anomaly.resourceId}
Metric: ${anomaly.metric} = ${anomaly.metricValue}
Severity: ${anomaly.severity}

Which of these past incidents is most similar? Return JSON with:
- mostSimilarIndex: number (0-based index)
- confidence: number (0-1)
- reasoning: string

Past incidents:
${pastIncidents.map((p, i) => `${i}. [${p.incidentNumber}] ${p.serviceType}/${p.resourceId} ${p.metric}=${p.metricValue || 'N/A'} - ${(p.rootCause || '').substring(0, 100)}`).join('\n')}`;

  try {
    const result = await llm.callGemini(prompt, 'You are an SRE analyzing incident patterns.');
    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Get resolution context from similar incidents (what worked before)
 */
async function getResolutionContext(similarIncidents) {
  if (similarIncidents.length === 0) return null;

  const resolvedWithFix = similarIncidents.filter(i => i.approvedFix !== null && i.suggestedFixes);

  if (resolvedWithFix.length === 0) return null;

  // Find most common successful fix pattern
  const fixPatterns = {};
  for (const inc of resolvedWithFix) {
    const fix = inc.suggestedFixes[inc.approvedFix];
    if (fix) {
      const key = fix.description.substring(0, 50);
      fixPatterns[key] = (fixPatterns[key] || 0) + 1;
    }
  }

  const mostCommon = Object.entries(fixPatterns).sort((a, b) => b[1] - a[1])[0];

  return {
    totalSimilar: similarIncidents.length,
    resolvedCount: resolvedWithFix.length,
    avgMTTR: Math.round(resolvedWithFix.reduce((sum, i) => sum + (i.mttrSeconds || 0), 0) / resolvedWithFix.length),
    mostCommonFix: mostCommon ? mostCommon[0] : null,
    mostCommonFixCount: mostCommon ? mostCommon[1] : 0,
    pastFixes: resolvedWithFix.slice(0, 3).map(i => ({
      incident: i.incidentNumber,
      fix: i.suggestedFixes[i.approvedFix]?.description,
      mttr: i.mttrSeconds
    }))
  };
}

module.exports = {
  findSimilar,
  findSimilarWithLLM,
  getResolutionContext
};
