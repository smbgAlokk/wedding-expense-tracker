import axios from 'axios';
import toast from 'react-hot-toast';

// VITE_API_URL is baked in at build time and must stay UNSET in production
// (same-origin Vercel proxy). When set (non-proxied setups), tolerate the
// shapes a human types and hard-fail on anything unrecoverable:
//   ''                         → '/api'  (Vite proxy in dev, Vercel proxy in prod)
//   'host.example.com[/api]'   → 'https://host.example.com/api'
//   'https://host.example.com' → 'https://host.example.com/api'
function resolveApiBase(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (!raw || !raw.trim()) return '/api';

  let url = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!/\/api$/i.test(url)) url = `${url}/api`;

  try {
    new URL(url);
  } catch {
    throw new Error(`[api] VITE_API_URL is not a valid URL: "${raw}". Expected e.g. "https://api.example.com".`);
  }
  return url;
}

export const API_BASE = resolveApiBase();

if (import.meta.env.PROD) {
  // One-line audit trail so a wrong deploy is obvious in devtools.
  console.info('[api] base URL =', API_BASE);
}

// Session lives in HttpOnly cookies (C-2); same-origin proxy keeps them first-party.
const api = axios.create({ baseURL: API_BASE, withCredentials: true, timeout: 15000 });

// ── CSRF double-submit ──────────────────────────────────────────────────────
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export function readCsrfCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

api.interceptors.request.use((config) => {
  if (MUTATING_METHODS.has((config.method || 'get').toLowerCase())) {
    const csrf = readCsrfCookie();
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

// ── Unreachable-backend toast (debounced: a refresh burst shows one toast) ──
let lastNetworkErrorToastAt = 0;
const NETWORK_ERROR_TOAST_COOLDOWN_MS = 10_000;

function notifyNetworkError() {
  const now = Date.now();
  if (now - lastNetworkErrorToastAt < NETWORK_ERROR_TOAST_COOLDOWN_MS) return;
  lastNetworkErrorToastAt = now;
  toast.error("Can't reach the server. Please check your connection or try again in a few minutes.", {
    id: 'network-error',
    duration: 6000,
  });
}

// ── Auth failure handling ───────────────────────────────────────────────────
// Endpoints that recover from their own 401 in-place (M-15).
const ENDPOINTS_THAT_HANDLE_OWN_401 = ['/auth/login/select-wedding'];
const handlesOwn401 = (url?: string) => !!url && ENDPOINTS_THAT_HANDLE_OWN_401.some((e) => url.endsWith(e));

// Non-sensitive UX cache only (member + workspace). `wedding_token` is the pre-C-2 legacy key.
export function saveLocalAuthCache(member: unknown, wedding: unknown) {
  localStorage.setItem('wedding_member', JSON.stringify(member));
  localStorage.setItem('wedding_data', JSON.stringify(wedding));
}

export function clearLocalAuthCache() {
  localStorage.removeItem('wedding_token');
  localStorage.removeItem('wedding_member');
  localStorage.removeItem('wedding_data');
}

function onAuthFailure() {
  clearLocalAuthCache();
  if (window.location.pathname !== '/') window.location.href = '/';
}

// ── Silent access-token refresh (single-flight) ─────────────────────────────
// Access token lives 15 min. The first 401 triggers ONE /auth/refresh shared by
// all concurrent 401s, then the original request is retried. Only a rejected
// refresh (401/403) means the session is dead → clear cache + bounce to landing;
// a rate limit, server error or network blip keeps the user signed in.
const REFRESH_PATH = '/auth/refresh';
let refreshPromise: Promise<unknown> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const original = error.config;
    const isRefreshCall = original?.url?.endsWith(REFRESH_PATH);

    if (status === 401 && handlesOwn401(original?.url)) return Promise.reject(error);

    if (status === 401 && original && !original._retry && !isRefreshCall) {
      original._retry = true;
      try {
        refreshPromise ??= api.post(REFRESH_PATH).finally(() => { refreshPromise = null; });
        await refreshPromise;
        return api(original);
      } catch (refreshErr: any) {
        const refreshStatus = refreshErr?.response?.status;
        if (refreshStatus === 401 || refreshStatus === 403) onAuthFailure();
        return Promise.reject(error);
      }
    }

    if (status === 401) {
      onAuthFailure();
      return Promise.reject(error);
    }

    // No response = offline, backend down, or CORS rejection. Cancellations are not errors.
    if (!error.response && error.code !== 'ERR_CANCELED') notifyNetworkError();

    return Promise.reject(error);
  },
);

export default api;
