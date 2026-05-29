import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

// Resolve the API base URL defensively.
//
// VITE_API_URL is baked into the production bundle at build time. If it's
// wrong, every request 404s and there's no runtime fallback short of
// rebuilding. We've now hit this twice (once for a missing /api suffix, once
// for a missing https:// scheme — axios silently treats schemeless values as
// paths relative to the page origin), so the code now tolerates the common
// shapes a human would type and hard-fails on anything unrecoverable.
//
// Accepts:   ''                                    → '/api'  (local dev — Vite proxy in vite.config.ts)
//            'host.example.com'                    → 'https://host.example.com/api'
//            'host.example.com/api'                → 'https://host.example.com/api'
//            'https://host.example.com'            → 'https://host.example.com/api'
//            'https://host.example.com/api'        → 'https://host.example.com/api'
//            'https://host.example.com/api/' (etc) → 'https://host.example.com/api'
function resolveApiBase(): string {
  const raw = import.meta.env.VITE_API_URL;

  if (!raw || !raw.trim()) return '/api';

  let url = raw.trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  if (!/\/api$/i.test(url)) {
    url = `${url}/api`;
  }

  try {
    // Throws on values like 'https://' or '://foo'. Better to break on boot
    // than spray 404s across every screen.
    new URL(url);
  } catch {
    throw new Error(
      `[api] VITE_API_URL is not a valid URL: "${raw}". ` +
      `Expected e.g. "https://your-backend.up.railway.app" or ` +
      `"https://your-backend.up.railway.app/api".`
    );
  }

  return url;
}

const API_BASE = resolveApiBase();

if (import.meta.env.PROD) {
  // One-line audit trail in devtools so a wrong deploy is obvious at a glance.
  // eslint-disable-next-line no-console
  console.info('[api] base URL =', API_BASE);
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wedding_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Surface "the backend isn't reachable" as a single user-visible toast instead of
// a silent console error per failed refresh. Debounced so the WeddingProvider's
// burst of refreshes (wedding + summary + members on mount/visibility) shows ONE
// banner, not three.
let lastNetworkErrorToastAt = 0;
const NETWORK_ERROR_TOAST_COOLDOWN_MS = 10_000;

function notifyNetworkError() {
  const now = Date.now();
  if (now - lastNetworkErrorToastAt < NETWORK_ERROR_TOAST_COOLDOWN_MS) return;
  lastNetworkErrorToastAt = now;
  toast.error(
    "Can't reach the server. Please check your connection or try again in a few minutes.",
    { id: 'network-error', duration: 6000 }
  );
}

// Security audit M-15 (2026-05-28): the 401 interceptor used to hard-redirect
// ANY 401 to '/', including 401s from the multi-wedding selector flow (where
// the user has no session yet — the redirect just bounces them out of the
// LandingPage's select-wedding mode and loses the toast that would have told
// them why). Endpoints in this allow-list handle their own 401s in-place.
const ENDPOINTS_THAT_HANDLE_OWN_401 = ['/auth/login/select-wedding'];
function urlHandlesOwn401(url: string | undefined): boolean {
  if (!url) return false;
  return ENDPOINTS_THAT_HANDLE_OWN_401.some((endpoint) => url.endsWith(endpoint));
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 — expired/invalid session. Clear local auth and bounce to landing,
    // UNLESS the failing endpoint is one that prefers to handle its own 401
    // (e.g., the multi-wedding selector — see M-15 above).
    if (error.response?.status === 401 && !urlHandlesOwn401(error.config?.url)) {
      localStorage.removeItem('wedding_token');
      localStorage.removeItem('wedding_member');
      localStorage.removeItem('wedding_data');
      window.location.href = '/';
      return Promise.reject(error);
    }

    // No response object at all = no answer from any server. Three real causes
    // in production: (a) backend host is down / DNS missing (ERR_NAME_NOT_RESOLVED),
    // (b) the user is offline, (c) CORS preflight rejection. In all three cases
    // the user sees a blank screen unless we tell them — which historically has
    // been the worst UX failure mode of this app. Skip the toast for canceled
    // requests (e.g. AbortController on route change) since those aren't errors.
    if (!error.response && error.code !== 'ERR_CANCELED' && error.code !== 'CanceledError') {
      notifyNetworkError();
    }

    return Promise.reject(error);
  }
);

// ============ Auth APIs ============
export const loginUser = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/auth/login', data);
export const googleLogin = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/auth/google', data);
export const selectWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/auth/login/select-wedding', data);
export const forgotPassword = (email: string): Promise<AxiosResponse> => api.post('/auth/forgot-password', { email });
export const resetPassword = (token: string, password: string): Promise<AxiosResponse> => api.post('/auth/reset-password', { token, password });
// H-5 (2026-05-28): email-verification flow. verifyEmail is called from the
// /verify-email page with the token from the email link; resendVerification
// is anti-enum (always returns generic success) so it can be triggered from a
// "didn't get the email?" CTA without leaking account existence.
export const verifyEmail = (token: string): Promise<AxiosResponse> => api.post('/auth/verify-email', { token });
export const resendVerification = (email: string): Promise<AxiosResponse> => api.post('/auth/resend-verification', { email });

// ============ Workspace APIs (mounted under /weddings/ until Phase 0b rename) ============
export const createWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/weddings', data);
// Multi-vertical Phase 2 (2026-05-27): Personal-vertical create. Backend
// auto-creates the lone owner member and skips join-code generation.
export const createPersonalWorkspace = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/weddings/personal', data);
export const joinWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/weddings/join', data);
export const getCurrentWedding = (): Promise<AxiosResponse> => api.get('/weddings/current');
export const updateWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.put('/weddings/current', data);
export const getWeddingMembers = (): Promise<AxiosResponse> => api.get('/weddings/current/members');
export const removeMember = (memberId: string): Promise<AxiosResponse> => api.delete(`/weddings/current/members/${memberId}`);

// ============ Expense APIs ============
//
// Optional `from` / `to` ISO timestamps on the list + summary endpoints scope
// the response to a date range. Personal-vertical uses this to show only the
// selected calendar month; Wedding / Trip omit them and get lifetime totals.

export const addExpense = (data: Record<string, any> | FormData, onUploadProgress?: (progressEvent: any) => void): Promise<AxiosResponse> => {
  const isFormData = data instanceof FormData;
  const config: AxiosRequestConfig = isFormData ? {
    timeout: 60_000,
    onUploadProgress,
  } : {};
  return api.post('/expenses', data, config);
};
export const getExpenses = (params?: Record<string, any>, signal?: AbortSignal): Promise<AxiosResponse> => api.get('/expenses', { params, signal });
export const getMyExpenses = (params?: Record<string, any>, signal?: AbortSignal): Promise<AxiosResponse> => api.get('/expenses/my', { params, signal });
export const getExpenseSummary = (params?: Record<string, any>): Promise<AxiosResponse> => api.get('/expenses/summary', { params });

// L1 + L2 — Analytics endpoint for the /insights page. One round-trip
// returns: KPIs + categoryBreakdown + vendorBreakdown + trend + day-of-week
// histogram (L1), plus prev-period comparison data + recurring-candidate
// vendors (L2). The server auto-selects daily vs monthly granularity based
// on span when omitted (≤ 92 days → day, else month).
export const getAnalytics = (
  params: {
    from: string;
    to: string;
    granularity?: 'day' | 'month';
    /** L2 — previous-period bounds for month-over-month rules. Both required to populate `data.prev`. */
    prevFrom?: string;
    prevTo?: string;
  },
  signal?: AbortSignal,
): Promise<AxiosResponse> => api.get('/expenses/analytics', { params, signal });

export const updateExpense = (id: string, data: Record<string, any>): Promise<AxiosResponse> => api.put(`/expenses/${id}`, data);
export const deleteExpense = (id: string): Promise<AxiosResponse> => api.delete(`/expenses/${id}`);

// ── L3 — AI Coach ────────────────────────────────────────────────────────
//
// Cheap state endpoints (status / enable / disable / waitlist) use the
// regular axios instance so they pick up the auth interceptor + retry logic.
// The streaming /coach endpoint uses raw `fetch()` instead because:
//   1. axios doesn't natively support response streaming in the browser
//   2. SSE is text/event-stream, which axios mishandles by default
//   3. AbortController + ReadableStream is the modern standard for this
export const getAICoachStatus = (): Promise<AxiosResponse> => api.get('/ai/coach/status');
export const enableAICoach = (): Promise<AxiosResponse> => api.post('/ai/coach/enable');
export const disableAICoach = (): Promise<AxiosResponse> => api.post('/ai/coach/disable');
export const joinAIWaitlist = (): Promise<AxiosResponse> => api.post('/ai/coach/waitlist');

/**
 * Stream a coach reply via SSE. The caller passes a question + the current
 * Insights analytics payload + the user's language; we return a small
 * controller object that emits parsed events through callbacks.
 *
 * Lifecycle:
 *   • onChunk(text)  — fired for each Gemini text delta
 *   • onError(code, message) — fired ONCE before onDone if upstream failed
 *   • onDone(meta)   — always fires last; `meta` includes streamed/aborted
 *
 * Cancellation: caller invokes returned `abort()` to stop the stream early.
 * Server-side, the request handler watches `req.on('close')` and aborts the
 * upstream Gemini call so we don't keep paying for tokens nobody reads.
 *
 * Auth: we mirror axios's `Authorization: Bearer <token>` header by reading
 * the same `wedding_token` localStorage key that the axios interceptor uses,
 * so SSE requests carry the JWT without a separate auth flow.
 */
export interface CoachStreamHandlers {
  onChunk: (text: string) => void;
  onMeta?: (meta: any) => void;
  /**
   * Error callback. `code` is a stable identifier (e.g. UPSTREAM_RATE_LIMITED)
   * that the UI maps to a localized message. `retryAfterSec`, when present,
   * is Google's own retry hint — the UI can offer a "try again in N s" timer
   * keyed off it.
   */
  onError?: (code: string, message: string, retryAfterSec?: number | null) => void;
  onDone?: (meta: { ok: boolean; streamed?: boolean; aborted?: boolean }) => void;
}
export interface CoachStreamHandle {
  abort: () => void;
  done: Promise<void>;
}
export function streamCoachReply(
  body: { question: string; analytics: any; lang: 'en' | 'hi' },
  handlers: CoachStreamHandlers,
): CoachStreamHandle {
  const controller = new AbortController();

  // Resolve the same API base axios uses (env override → '/api' fallback).
  // We can't introspect axios.defaults.baseURL reliably across SSR/test
  // environments, so we re-derive from the same VITE_API_URL signal.
  const base =
    (import.meta as any).env?.VITE_API_URL ||
    (typeof window !== 'undefined' ? '/api' : '/api');

  const token = (() => {
    try { return window.localStorage.getItem('wedding_token') || ''; } catch { return ''; }
  })();

  const done = (async () => {
    let response: Response;
    try {
      response = await fetch(`${base}/ai/coach`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        handlers.onError?.('NETWORK', err?.message || 'network', null);
      }
      handlers.onDone?.({ ok: false, aborted: err?.name === 'AbortError' });
      return;
    }

    // Non-2xx → server sent a JSON error body, not SSE. Parse + surface.
    if (!response.ok) {
      let code = 'HTTP_ERROR';
      let message = `HTTP ${response.status}`;
      let retryAfterSec: number | null = null;
      try {
        const payload = await response.json();
        code = payload.code || code;
        message = payload.message || message;
        retryAfterSec = payload.retryAfterSec ?? null;
      } catch {
        // Body wasn't JSON — keep the generic message.
      }
      handlers.onError?.(code, message, retryAfterSec);
      handlers.onDone?.({ ok: false });
      return;
    }

    if (!response.body) {
      handlers.onError?.('NO_BODY', 'Empty response body');
      handlers.onDone?.({ ok: false });
      return;
    }

    // Parse SSE on the fly. Spec: events are blank-line separated; each
    // event has `event:` + `data:` lines. We accumulate `data` lines per
    // event so multi-line payloads work, then dispatch on blank line.
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEvent = 'message';
    let currentData = '';

    const dispatch = () => {
      const event = currentEvent;
      const dataRaw = currentData;
      currentEvent = 'message';
      currentData = '';
      if (!dataRaw) return;
      let parsed: any = null;
      try { parsed = JSON.parse(dataRaw); } catch { parsed = { text: dataRaw }; }
      if (event === 'chunk') {
        handlers.onChunk(parsed?.text || '');
      } else if (event === 'meta') {
        handlers.onMeta?.(parsed);
      } else if (event === 'error') {
        handlers.onError?.(parsed?.code || 'STREAM_ERROR', parsed?.message || 'Stream error', parsed?.retryAfterSec ?? null);
      } else if (event === 'done') {
        handlers.onDone?.({ ok: !!parsed?.ok, streamed: !!parsed?.streamed, aborted: !!parsed?.aborted });
      }
    };

    try {
      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        // Split into complete events on blank lines (\n\n or \r\n\r\n).
        let sep: number;
        while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + (buffer[sep] === '\r' ? 4 : 2));
          for (const line of raw.split(/\r?\n/)) {
            if (!line) continue;
            const colon = line.indexOf(':');
            if (colon < 0) continue;
            const field = line.slice(0, colon).trim();
            // Per SSE spec the first space after `:` is optional & stripped.
            const value = line.slice(colon + 1).replace(/^ /, '');
            if (field === 'event') currentEvent = value;
            else if (field === 'data') currentData += (currentData ? '\n' : '') + value;
          }
          dispatch();
        }
      }
      // Drain any trailing event without a final \n\n.
      if (currentData) dispatch();
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        handlers.onError?.('READ_ERROR', err?.message || 'read error', null);
      }
      handlers.onDone?.({ ok: false, aborted: err?.name === 'AbortError' });
    }
  })();

  return { abort: () => controller.abort(), done };
}

export default api;
