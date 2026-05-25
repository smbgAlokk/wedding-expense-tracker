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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 — expired/invalid session. Clear local auth and bounce to landing.
    if (error.response?.status === 401) {
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

// ============ Wedding APIs ============
export const createWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/weddings', data);
export const joinWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/weddings/join', data);
export const getCurrentWedding = (): Promise<AxiosResponse> => api.get('/weddings/current');
export const updateWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.put('/weddings/current', data);
export const getWeddingMembers = (): Promise<AxiosResponse> => api.get('/weddings/current/members');
export const removeMember = (memberId: string): Promise<AxiosResponse> => api.delete(`/weddings/current/members/${memberId}`);

// ============ Expense APIs ============

export const addExpense = (data: Record<string, any> | FormData, onUploadProgress?: (progressEvent: any) => void): Promise<AxiosResponse> => {
  const isFormData = data instanceof FormData;
  const config: AxiosRequestConfig = isFormData ? {
    timeout: 60_000,
    onUploadProgress,
  } : {};
  return api.post('/expenses', data, config);
};
export const getExpenses = (params?: Record<string, any>, signal?: AbortSignal): Promise<AxiosResponse> => api.get('/expenses', { params, signal });
export const getMyExpenses = (signal?: AbortSignal): Promise<AxiosResponse> => api.get('/expenses/my', { signal });
export const getExpenseSummary = (): Promise<AxiosResponse> => api.get('/expenses/summary');
export const updateExpense = (id: string, data: Record<string, any>): Promise<AxiosResponse> => api.put(`/expenses/${id}`, data);
export const deleteExpense = (id: string): Promise<AxiosResponse> => api.delete(`/expenses/${id}`);

export default api;
