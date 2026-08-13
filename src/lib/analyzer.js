/**
 * Analyzer client.
 *
 * Resolution order:
 *  1. REACT_APP_ANALYZE_URL — your own backend. POSTs
 *     { prompt, filename, documentBase64 } and expects
 *     { suggestions: [{ id, title, severity, originalText, suggestedText, reason }] }.
 *  2. A user-supplied OpenAI key, entered in the UI and held only in the
 *     browser's localStorage (see lib/settingsStore.js) — never in the
 *     codebase, .env, or build bundle. Calls OpenAI directly from the browser
 *     (the key is still visible in this browser's devtools/network tab, but
 *     it's the user's own key, on their own machine, and never leaves it
 *     except in requests straight to OpenAI). Docx isn't natively parseable
 *     by OpenAI models, so this sends the document's extracted plain text
 *     (not raw base64 docx bytes) plus your instruction, and asks for
 *     structured JSON back via response_format: json_schema.
 *  3. Otherwise falls back to a deterministic mock so the UI works offline.
 */

import { getOpenAIKey, getOpenAIModel } from './settingsStore';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_DOC_CHARS = 12000;

export async function analyzeDocument({ prompt, filename, documentBase64, plainText }) {
    const url = process.env.REACT_APP_ANALYZE_URL;
    const apiKey = process.env.REACT_APP_ANALYZE_API_KEY;
    const openaiKey = getOpenAIKey();

    if (url) {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ prompt, filename, documentBase64 }),
        });
        if (!res.ok) {
            throw new Error(`Analyze API failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return normalize(data.suggestions || []);
    }

    if (openaiKey) {
        return analyzeWithOpenAI({ prompt, plainText, filename, apiKey: openaiKey });
    }

    return mockAnalyze({ prompt, plainText });
}

const SUGGESTIONS_JSON_SCHEMA = {
    name: 'redline_suggestions',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            suggestions: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        title: { type: 'string' },
                        severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                        originalText: { type: 'string' },
                        suggestedText: { type: 'string' },
                        reason: { type: 'string' },
                    },
                    required: ['title', 'severity', 'originalText', 'suggestedText', 'reason'],
                },
            },
        },
        required: ['suggestions'],
    },
};

const SYSTEM_PROMPT = `You are a contract/document redlining assistant. You are given the full plain text of a document and an editing instruction from the reviewer.

Identify the specific passages that need to change and propose edits.

Rules:
- "originalText" MUST be an exact, verbatim substring copied from the document text provided (same spelling, punctuation and casing). Do not paraphrase or summarize it. This is critical: it is used to locate and highlight the text in the live document.
- Keep each "originalText" as short as possible while remaining unambiguous — usually a single clause or sentence, never the whole document.
- "suggestedText" is your proposed replacement for that exact span.
- "reason" briefly explains, in plain language, why the change is needed and how it relates to the reviewer's instruction.
- "severity" is "high" for material/legal risk, "medium" for clarity/quality issues, "low" for style/polish.
- Only include spans that genuinely need edits. If nothing needs changing, return an empty suggestions array.
- Return at most 8 suggestions, ordered by importance.`;

async function analyzeWithOpenAI({ prompt, plainText, filename, apiKey }) {
    const model = getOpenAIModel() || process.env.REACT_APP_OPENAI_MODEL || 'gpt-4o-mini';
    const docText = (plainText || '').slice(0, MAX_DOC_CHARS);

    if (!docText.trim()) {
        throw new Error('No readable text was extracted from the document yet. Wait for it to finish loading and try again.');
    }

    const userPrompt = `Instruction: ${prompt}\n\nDocument (${filename || 'document'}):\n"""\n${docText}\n"""`;

    const res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_schema', json_schema: SUGGESTIONS_JSON_SCHEMA },
        }),
    });

    if (!res.ok) {
        let detail = '';
        try {
            const errBody = await res.json();
            detail = errBody?.error?.message || '';
        } catch (e) {
            // ignore parse failure
        }
        throw new Error(`OpenAI API failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned an empty response.');

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        throw new Error('Failed to parse OpenAI response as JSON.');
    }

    const suggestions = normalize(parsed.suggestions || []);

    // Drop any suggestion whose originalText isn't a verbatim match — those
    // can't be located/redlined in the live document.
    return suggestions.filter((s) => {
        const ok = !s.originalText || docText.includes(s.originalText);
        if (!ok) {
            console.warn('[analyzer] Dropping suggestion — originalText not found verbatim in document:', s.title);
        }
        return ok;
    });
}

function normalize(list) {
    return list.map((s, i) => ({
        id: s.id || `sugg-${i + 1}`,
        title: s.title || 'Suggested edit',
        severity: (s.severity || 'medium').toLowerCase(),
        originalText: s.originalText || '',
        suggestedText: s.suggestedText || '',
        reason: s.reason || '',
    }));
}

/** Deterministic mock: picks a few salient sentences and proposes clarifications. */
function mockAnalyze({ prompt, plainText }) {
    const text = (plainText || '').trim();
    if (!text) {
        return [
            {
                id: 'sugg-demo-1',
                title: 'Add a definitions section',
                severity: 'medium',
                originalText: '',
                suggestedText: 'Definitions. Capitalized terms have the meanings set forth in Exhibit A.',
                reason:
                    'No document text was readable. This is a demo card — connect REACT_APP_ANALYZE_URL to a real service.',
            },
        ];
    }

    const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20 && s.length < 400);

    const picks = [];
    const wanted = Math.min(4, sentences.length);
    const step = Math.max(1, Math.floor(sentences.length / (wanted + 1)));

    for (let i = 0; i < wanted; i++) {
        const s = sentences[(i + 1) * step - 1];
        if (!s) continue;
        picks.push(buildSuggestion(s, i, prompt));
    }

    if (picks.length === 0) {
        picks.push(buildSuggestion(sentences[0] || text.slice(0, 120), 0, prompt));
    }
    return picks;
}

function buildSuggestion(sentence, i, prompt) {
    const severities = ['high', 'medium', 'low', 'medium'];
    const templates = [
        {
            title: 'Tighten ambiguous language',
            transform: (s) => s.replace(/\breasonable\b/i, 'commercially reasonable'),
            reason:
                '"Reasonable" is ambiguous and litigation-prone. "Commercially reasonable" is a recognized legal standard.',
        },
        {
            title: 'Clarify obligation',
            transform: (s) => s.replace(/\bshall\b/i, 'must').replace(/\bmay\b/i, 'is entitled to'),
            reason: 'Prefer plain-language modal verbs to avoid drafting ambiguity around obligations vs. permissions.',
        },
        {
            title: 'Add specificity',
            transform: (s) => (s.endsWith('.') ? s.slice(0, -1) : s) + ', within thirty (30) days of written notice.',
            reason: 'Undefined timeframes weaken enforceability. Adding a fixed cure period makes the clause actionable.',
        },
        {
            title: 'Remove filler',
            transform: (s) => s.replace(/\b(hereby|whatsoever|in any manner)\b/gi, '').replace(/\s{2,}/g, ' ').trim(),
            reason: 'Legalese filler adds no meaning and reduces readability without changing the legal effect.',
        },
    ];

    const t = templates[i % templates.length];
    let suggested = t.transform(sentence);
    if (suggested === sentence) {
        suggested = sentence.replace(/\.$/, '') + ' (as further described in Exhibit A).';
    }

    return {
        id: `sugg-${i + 1}`,
        title: t.title,
        severity: severities[i % severities.length],
        originalText: sentence,
        suggestedText: suggested,
        reason: prompt ? `${t.reason} Aligned with instruction: "${truncate(prompt, 120)}"` : t.reason,
    };
}

function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
