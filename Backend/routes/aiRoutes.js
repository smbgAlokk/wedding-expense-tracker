/**
 * L3 — AI Coach routes (Gemini Flash).
 *
 * Endpoints:
 *   GET  /api/ai/coach/status            — cheap; quota + enabled + waitlist flags
 *   POST /api/ai/coach/enable            — flips aiCoachEnabled = true
 *   POST /api/ai/coach/disable           — flips aiCoachEnabled = false (also stops quota for revoke flows)
 *   POST /api/ai/coach/waitlist          — flips aiWaitlistJoined = true
 *   POST /api/ai/coach                   — SSE stream of Gemini's reply
 *
 * The /coach endpoint is the only one that performs an LLM call. Everything
 * else is a cheap state read or single-field write.
 *
 * RATE LIMITING (three layers, narrow → wide):
 *   1. Per-user daily / monthly quota (middleware/aiQuota.js)
 *   2. Per-IP express-rate-limit on this router (DDoS / runaway-loop shield)
 *   3. Global limiter on /api/* from server.js (always applies)
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Member = require('../models/Member');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect } = require('../middleware/auth');
const { isConfigured, streamCoachReply, parseGeminiError, MODEL_ID } = require('../utils/gemini');
const {
  buildContextSnapshot,
  buildSystemPrompt,
  buildUserMessage,
  sanitizeUserQuestion,
  MAX_USER_QUESTION_LEN,
} = require('../utils/aiSystemPrompt');
const { readQuota, incrementUsage } = require('../middleware/aiQuota');

// Narrow per-IP shield for the EXPENSIVE endpoint (POST /coach — actual
// Gemini call). This used to be applied router-wide (`router.use(aiLimiter)`)
// which incorrectly counted cheap GET /coach/status reads against the same
// 20/15min budget — quickly hitting 429 after a few tab switches in dev
// (each remount of Settings + CoachSection fires /status, multiplied by
// React StrictMode's double-effect-invoke in dev).
//
// Cheap reads (/status, /enable, /disable, /waitlist) now rely on the
// global /api/ limiter from server.js (200 req / 15min) — plenty for normal
// usage, while the streaming POST still has its own narrow shield below.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many AI requests, please try again in a few minutes' },
});

// ── GET /status — cheap quota + flag read ─────────────────────────────
router.get('/coach/status', protect, asyncHandler(async (req, res) => {
  const member = await Member.findById(req.member._id)
    .select('aiCoachEnabled aiUsage aiWaitlistJoined');
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

  res.json({
    success: true,
    data: {
      configured: isConfigured(),
      enabled: !!member.aiCoachEnabled,
      waitlistJoined: !!member.aiWaitlistJoined,
      quota: readQuota(member),
      model: MODEL_ID,
      maxQuestionLength: MAX_USER_QUESTION_LEN,
    },
  });
}));

// ── POST /enable + POST /disable ───────────────────────────────────────
router.post('/coach/enable', protect, asyncHandler(async (req, res) => {
  // The frontend's consent modal is the user-facing gate; the backend
  // simply records the bit. We do NOT require any extra payload — the
  // consent text is part of the privacy explainer the user just read.
  const member = await Member.findByIdAndUpdate(
    req.member._id,
    { $set: { aiCoachEnabled: true } },
    { new: true, select: 'aiCoachEnabled aiUsage aiWaitlistJoined' },
  );
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
  res.json({
    success: true,
    message: 'AI Coach enabled',
    data: {
      configured: isConfigured(),
      enabled: true,
      waitlistJoined: !!member.aiWaitlistJoined,
      quota: readQuota(member),
    },
  });
}));

router.post('/coach/disable', protect, asyncHandler(async (req, res) => {
  const member = await Member.findByIdAndUpdate(
    req.member._id,
    { $set: { aiCoachEnabled: false } },
    { new: true, select: 'aiCoachEnabled aiUsage aiWaitlistJoined' },
  );
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
  res.json({
    success: true,
    message: 'AI Coach disabled',
    data: {
      configured: isConfigured(),
      enabled: false,
      waitlistJoined: !!member.aiWaitlistJoined,
      quota: readQuota(member),
    },
  });
}));

// ── POST /waitlist — quota-exceeded waitlist signup ────────────────────
router.post('/coach/waitlist', protect, asyncHandler(async (req, res) => {
  // No payload — the user's email is already on the Member doc; we just
  // flip a marketing bit. Future Pro tier can iterate over Members with
  // aiWaitlistJoined=true to send launch emails.
  await Member.findByIdAndUpdate(req.member._id, { $set: { aiWaitlistJoined: true } });
  res.json({ success: true, message: 'You\'re on the Pro waitlist' });
}));

// ── POST /coach — SSE-streamed Gemini reply ────────────────────────────
//
// Wire format:
//   event: chunk      data: { "text": "..." }
//   event: meta       data: { "usage": {...}, "finishReason": "..." }
//   event: done       data: { "ok": true }
//   event: error      data: { "code": "...", "message": "..." }
//
// The frontend's SSE reader (api.ts) routes these to the response renderer.
//
router.post('/coach', aiLimiter, protect, asyncHandler(async (req, res) => {
  const { question, analytics, lang } = req.body || {};

  // ── Pre-flight checks (cheap, no LLM call yet) ───────────────────────
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      code: 'NOT_CONFIGURED',
      message: 'AI Coach is unavailable right now — please try again later',
    });
  }

  const safeQuestion = sanitizeUserQuestion(question);
  if (!safeQuestion) {
    return res.status(400).json({
      success: false,
      code: 'EMPTY_QUESTION',
      message: 'Please type a question for the coach',
    });
  }

  const member = await Member.findById(req.member._id)
    .select('aiCoachEnabled aiUsage');
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

  if (!member.aiCoachEnabled) {
    return res.status(403).json({
      success: false,
      code: 'NOT_ENABLED',
      message: 'AI Coach is disabled. Turn it on in Settings to use it.',
    });
  }

  const quota = readQuota(member);
  if (quota.anyExceeded) {
    const which = quota.daily.exceeded ? 'DAILY_QUOTA_EXCEEDED' : 'MONTHLY_QUOTA_EXCEEDED';
    return res.status(429).json({
      success: false,
      code: which,
      message: quota.daily.exceeded
        ? 'You\'ve reached your daily AI Coach limit. Try again tomorrow or join the Pro waitlist.'
        : 'You\'ve reached your monthly AI Coach limit. Join the Pro waitlist for higher limits.',
      data: { quota },
    });
  }

  // Workspace data fetch — we never trust the client-provided analytics
  // blob as the source of truth; we accept it as a hint for which range
  // the user is currently viewing on /insights, but the AI sees the
  // server-side snapshot built from authenticated workspace data.
  const Wedding = require('../models/Wedding');
  const wedding = await Wedding.findById(req.weddingId)
    .select('categories budgetAllocation currency');

  // Build the audit-safe context snapshot. We pass the client analytics
  // through because it already contains aggregations we don't want to
  // recompute here (the /analytics route just ran them). The snapshot
  // builder validates + trims the shape so a malicious client can't blow
  // up our prompt size.
  const snapshot = buildContextSnapshot({ analytics, wedding, lang });

  if (!snapshot || snapshot.headline.totalCount === 0) {
    return res.status(400).json({
      success: false,
      code: 'NO_DATA',
      message: 'Log some expenses first — the coach needs data to give useful advice.',
    });
  }

  const systemPrompt = buildSystemPrompt(snapshot);
  const userMessage = buildUserMessage(safeQuestion);

  // ── Open the SSE stream ──────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // CORS preflight already handled by global cors() middleware. SSE
  // responses don't need any extra CORS headers.
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/proxy buffering
  res.flushHeaders?.();

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Tie our cancellation to the client connection closing — if the user
  // navigates away mid-stream, abort upstream so we don't keep paying
  // Gemini for tokens nobody is reading.
  const ac = new AbortController();
  req.on('close', () => ac.abort());

  let streamStarted = false;
  let aborted = false;

  // CRITICAL: We separate the upstream INIT call from the per-chunk loop in
  // distinct try blocks. An upstream 429 / 5xx / network error happens at
  // init time (before any tokens are produced), and we must:
  //   1. Send a CLEAN error frame to the client — never echo the raw
  //      Google SDK message which leaks model name, URLs, quota IDs.
  //   2. NOT charge the user's per-account quota — they got nothing.
  let result;
  try {
    result = await streamCoachReply(systemPrompt, userMessage, { signal: ac.signal });
  } catch (err) {
    const parsed = parseGeminiError(err);
    // Log the raw error server-side for operator diagnosis — but never
    // surface it over the wire.
    req.log.error({ code: parsed.code, status: parsed.status || '-', err: err?.message?.slice(0, 200) || '' }, 'ai/coach: upstream init failed');
    if (!res.writableEnded) {
      send('error', {
        code: parsed.code,
        message: parsed.safeMessage,
        retryAfterSec: parsed.retryAfterSec,
      });
      send('done', { ok: false, streamed: false });
      res.end();
    }
    return;
  }

  // Stream the tokens. Per-chunk errors are rarer (Gemini occasionally
  // throws mid-stream on a safety block) but use the same sanitization path.
  try {
    for await (const chunk of result.stream) {
      if (ac.signal.aborted) { aborted = true; break; }
      streamStarted = true;
      send('chunk', { text: chunk });
    }

    if (!aborted) {
      const meta = await result.finalize();
      send('meta', meta);
    }

    // Quota: charge ONLY when the stream actually started producing tokens.
    // Safety blocks or rate-limits at the 0-token mark hit the init catch
    // above (no charge); only paid token output charges the quota.
    if (streamStarted) {
      try {
        await incrementUsage(Member, req.member._id);
      } catch (err) {
        // Counter update failure is non-fatal — log but don't blow up the
        // SSE response. The user got their answer; we just lost a counter
        // tick (worst case: they get one extra free request).
        req.log.error({ err: err.message }, 'ai/coach: quota increment failed');
      }
    }

    send('done', { ok: true, streamed: streamStarted, aborted });
    res.end();
  } catch (err) {
    const parsed = parseGeminiError(err);
    req.log.error({ code: parsed.code, err: err?.message?.slice(0, 200) || '' }, 'ai/coach: mid-stream failed');
    if (!res.writableEnded) {
      send('error', {
        code: parsed.code,
        message: parsed.safeMessage,
        retryAfterSec: parsed.retryAfterSec,
      });
      send('done', { ok: false, streamed: streamStarted });
      res.end();
    }
  }
}));

module.exports = router;
