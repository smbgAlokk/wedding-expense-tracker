/**
 * L3 — Google Gemini Flash wrapper.
 *
 * Thin abstraction over @google/generative-ai's GoogleGenerativeAI client.
 * Two responsibilities:
 *   1. Lazy-init the SDK exactly once per process (configured via env).
 *   2. Expose `streamCoachReply(systemPrompt, userPrompt, opts)` — an async
 *      iterator of text chunks. Caller wires this to the SSE response.
 *
 * Boot-time preflight is in server.js; this module is permissive at import
 * time so server.js can start in dev environments without a GEMINI_API_KEY
 * (the /api/ai/* routes return a 503 explaining the situation).
 *
 * Safety settings:
 *   We set BLOCK_NONE on all four harm categories. Personal finance is a
 *   benign domain and Google's default thresholds will occasionally block
 *   legitimate prompts containing words like "spend", "burn", "cut". Our
 *   own system-prompt design + the no-billing/no-PII data shape are the
 *   real safety controls.
 */

// Model is env-configurable so operators can switch without a redeploy when
// Google moves models between free / paid tiers (which they do periodically).
// Default to gemini-2.5-flash because:
//   1. It's Google's current "flash" recommendation (Q1 2026)
//   2. It has free-tier capacity at the time of writing
//   3. The previous default (gemini-2.0-flash) was moved to paid-tier in some
//      regions which caused upstream 429s with `limit: 0` for free-tier keys
// Alternatives operators can set via env: gemini-1.5-flash (older but very
// reliable free tier), gemini-2.0-flash (requires billing in most regions).
const MODEL_ID = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const SDK_PACKAGE = '@google/generative-ai';

let _client = null;
let _model = null;
let _initError = null;

/**
 * Lazily instantiate the SDK using the GEMINI_API_KEY env var. Safe to call
 * many times; only the first attempt has side effects. Returns null and
 * stores the error on _initError if the SDK can't be loaded or the key is
 * missing — callers check `isConfigured()` rather than catching.
 */
function ensureClient() {
  if (_model || _initError) return _model;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    _initError = new Error('GEMINI_API_KEY is not set');
    return null;
  }
  try {
    // Require at runtime — keeps the package fully optional. If it's not
    // installed at all the require throws and we surface the same 503.
    const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require(SDK_PACKAGE);
    _client = new GoogleGenerativeAI(apiKey);
    _model = _client.getGenerativeModel({
      model: MODEL_ID,
      // Belt-and-suspenders: even though the system prompt does the heavy
      // lifting, we tighten the generation config to keep responses small,
      // focused, and on-topic. Output cap matches the ~250 word target.
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        topK: 32,
        maxOutputTokens: 600,
        // Plain text — the renderer is markdown-lite, no HTML / images / etc.
        responseMimeType: 'text/plain',
      },
      safetySettings: [
        HarmCategory.HARM_CATEGORY_HARASSMENT,
        HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      ].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH })),
    });
    return _model;
  } catch (err) {
    _initError = err;
    return null;
  }
}

function isConfigured() {
  return Boolean(ensureClient());
}

function lastInitError() {
  return _initError;
}

/**
 * Stream a coach reply. Returns an async generator of plain-text chunks.
 *
 * The Gemini SDK exposes `generateContentStream` which yields chunks with
 * `.text()` for the textual delta and `.candidates` for safety / finish
 * metadata. We surface only the deltas; finish-reason is read after the
 * stream drains so the route can attach it to the SSE `done` frame.
 *
 * Cancellation: the caller passes an AbortSignal. We propagate via
 * abortSignal in the request options; Gemini's SDK aborts the upstream
 * fetch and the async iterator throws on the next read.
 *
 * @returns {{ stream: AsyncIterable<string>, finalize: () => Promise<{ finishReason?: string, usage?: any }> }}
 */
async function streamCoachReply(systemPrompt, userPrompt, opts = {}) {
  const model = ensureClient();
  if (!model) throw _initError || new Error('Gemini client unavailable');

  const { signal } = opts;

  // Gemini's generateContentStream returns { stream, response }. We expose
  // the text deltas via our own iterator (avoids leaking the SDK shape into
  // the route layer) and a finalize() that resolves to safety / finish
  // metadata once the model has finished sending.
  let result;
  try {
    result = await model.generateContentStream({
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    }, { signal });
  } catch (err) {
    // The SDK throws synchronously for malformed config; propagate cleanly.
    throw err;
  }

  async function* iterChunks() {
    try {
      for await (const chunk of result.stream) {
        if (signal && signal.aborted) {
          // The SDK should bail on its own when the signal fires, but a
          // belt-and-suspenders check covers race conditions where a
          // chunk arrives between the abort and the SDK noticing.
          return;
        }
        // chunk.text() can throw if safety blocked the response mid-stream.
        // Surfacing as null lets the caller end the SSE cleanly with an
        // error frame instead of crashing the request.
        let text = '';
        try { text = chunk.text() || ''; } catch { text = ''; }
        if (text) yield text;
      }
    } catch (err) {
      // Re-throw so the caller can convert to an SSE error frame. We don't
      // want to silently swallow upstream failures.
      throw err;
    }
  }

  async function finalize() {
    try {
      const final = await result.response;
      const cand = final.candidates && final.candidates[0];
      return {
        finishReason: cand?.finishReason || null,
        // usageMetadata mirrors Anthropic's `usage`; we surface it so the
        // route can log cost-tracking telemetry later without a redeploy.
        usage: final.usageMetadata || null,
      };
    } catch (err) {
      return { finishReason: 'ERROR', usage: null, error: err.message };
    }
  }

  return { stream: iterChunks(), finalize };
}

/**
 * Parse a Google Gemini SDK error into a stable internal shape. The SDK
 * formats errors as `[GoogleGenerativeAI Error]: Error fetching from <URL>:
 * [<status> <statusText>] <body>` with the body containing structured
 * quota / retry details. We extract just what we need for clean UX:
 *
 *   • code         — stable string the frontend maps to i18n
 *   • status       — HTTP status when we can parse it
 *   • retryAfterSec — when Google sends a retry hint, surface it so the
 *                     UI can show "try again in X seconds"
 *   • safeMessage  — short, user-shaped message we control; never echoes
 *                    the raw upstream string (which leaks model name,
 *                    URLs, quota metric IDs, etc.)
 *
 * Returning a stable shape means the route layer NEVER has to inspect
 * err.message — which is the actual root cause of the original error-leak
 * bug, where the raw Google string ended up in the frontend toast.
 */
function parseGeminiError(err) {
  const raw = typeof err?.message === 'string' ? err.message : '';

  // Extract HTTP status from the `[<status> <text>]` prefix the SDK uses.
  // Falls back to err.status (some SDK versions expose it directly).
  let status = null;
  const m = raw.match(/\[(\d{3})\s/);
  if (m) status = parseInt(m[1], 10);
  else if (typeof err?.status === 'number') status = err.status;

  // Optional retry hint from Google's `retryDelay` field. Format examples:
  //   "Please retry in 10.41s"
  //   "Please retry in 10.41477801s."
  let retryAfterSec = null;
  const rm = raw.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (rm) retryAfterSec = Math.ceil(parseFloat(rm[1]));

  // Map to canonical codes. The mapping is intentionally narrow — every
  // bucket gets a specific i18n key on the frontend so the user sees a
  // helpful message and (when applicable) a retry timer.
  let code = 'UPSTREAM_ERROR';
  if (err?.name === 'AbortError') code = 'ABORTED';
  else if (status === 429) code = 'UPSTREAM_RATE_LIMITED';
  else if (status === 400) code = 'UPSTREAM_BAD_REQUEST';
  else if (status === 401 || status === 403) code = 'UPSTREAM_AUTH';
  else if (status === 404) code = 'UPSTREAM_NOT_FOUND';
  else if (status && status >= 500) code = 'UPSTREAM_SERVER';
  else if (/network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(raw)) code = 'UPSTREAM_NETWORK';

  // Safe messages — short, user-shaped, never leaks raw upstream details.
  // The frontend has its own i18n keyed off `code`; this string is the
  // english fallback when the frontend doesn't have a translation.
  const SAFE_MESSAGES = {
    UPSTREAM_RATE_LIMITED: 'AI Coach is busy right now — please try again in a moment.',
    UPSTREAM_BAD_REQUEST:  'Your question couldn\'t be processed. Try rephrasing.',
    UPSTREAM_AUTH:         'AI Coach is unavailable right now.',
    UPSTREAM_NOT_FOUND:    'AI Coach is unavailable right now.',
    UPSTREAM_SERVER:       'AI Coach had a temporary issue. Please retry.',
    UPSTREAM_NETWORK:      'Could not reach AI Coach. Please retry.',
    UPSTREAM_ERROR:        'AI Coach had a temporary issue. Please retry.',
    ABORTED:               'Stopped.',
  };

  return {
    code,
    status,
    retryAfterSec,
    safeMessage: SAFE_MESSAGES[code] || SAFE_MESSAGES.UPSTREAM_ERROR,
  };
}

module.exports = {
  MODEL_ID,
  isConfigured,
  lastInitError,
  streamCoachReply,
  parseGeminiError,
};
