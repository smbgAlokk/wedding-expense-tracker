// Cloudflare Turnstile verification (Security audit H-8, §14.F).
//
// CAPTCHA on signup / login / forgot-password to blunt distributed brute-force
// and signup spam (compounds with H-2 lockout + the IP rate limits). This is
// ENV-GATED: with no TURNSTILE_SECRET configured, verifyTurnstile() is a no-op
// that returns { skipped: true, success: true } — so dev and any deployment
// without keys behave exactly as before. Provision keys (free) at
// https://dash.cloudflare.com → Turnstile, then set TURNSTILE_SECRET (backend)
// + VITE_TURNSTILE_SITE_KEY (frontend) to switch enforcement on.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True when a secret is configured and enforcement should happen. */
const turnstileEnabled = () =>
  !!process.env.TURNSTILE_SECRET && String(process.env.TURNSTILE_SECRET).trim() !== '';

/**
 * Verify a Turnstile token from the client.
 * @returns {Promise<{ success: boolean, skipped: boolean, errorCodes?: string[] }>}
 *   skipped:true when no secret is configured (treated as success — the gate
 *   is simply off). On a real verification, success reflects Cloudflare's verdict.
 */
async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled()) {
    return { success: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { success: false, skipped: false, errorCodes: ['missing-input-response'] };
  }

  const body = new URLSearchParams();
  body.append('secret', process.env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return {
      success: !!data.success,
      skipped: false,
      errorCodes: data['error-codes'] || [],
    };
  } catch (err) {
    // Network failure to Cloudflare. Fail CLOSED — a CAPTCHA we can't verify is
    // not a CAPTCHA passed. The user can retry; transient and rare.
    return { success: false, skipped: false, errorCodes: ['verification-failed'] };
  }
}

module.exports = { verifyTurnstile, turnstileEnabled };
