import axios from 'axios';

const API_BASE = '/api';

// IMPORTANT: do NOT set a global default `Content-Type`.
// Axios 1.x infers it per request based on the data type:
//   - plain object  → application/json
//   - FormData      → multipart/form-data; boundary=… (browser auto-injects boundary)
//   - URLSearchParams → application/x-www-form-urlencoded
// Setting a global JSON default would force `formDataToJSON()` on multipart payloads,
// which silently drops File objects (they serialize to `{}`).
const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wedding_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Handle 401 globally (expired/invalid session)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('wedding_token');
      localStorage.removeItem('wedding_member');
      localStorage.removeItem('wedding_data');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// ============ Auth APIs ============
export const loginUser = (data) => api.post('/auth/login', data);
export const googleLogin = (data) => api.post('/auth/google', data);
export const selectWedding = (data) => api.post('/auth/login/select-wedding', data);

// ============ Wedding APIs ============
export const createWedding = (data) => api.post('/weddings', data);
export const joinWedding = (data) => api.post('/weddings/join', data);
export const getCurrentWedding = () => api.get('/weddings/current');
export const updateWedding = (data) => api.put('/weddings/current', data);
export const getWeddingMembers = () => api.get('/weddings/current/members');
export const removeMember = (memberId) => api.delete(`/weddings/current/members/${memberId}`);

// ============ Expense APIs ============

/**
 * Add expense — accepts a plain object (JSON) or a FormData (multipart with receipt).
 *
 * @param {object|FormData} data
 * @param {(progressEvent: object) => void} [onUploadProgress] — fires as bytes are sent
 *        (only meaningful for FormData / file uploads)
 */
export const addExpense = (data, onUploadProgress) => {
  const isFormData = data instanceof FormData;
  return api.post('/expenses', data, isFormData ? {
    timeout: 60_000, // generous: covers slow networks + Cloudinary roundtrip
    onUploadProgress,
  } : undefined);
};
export const getExpenses = (params) => api.get('/expenses', { params });
export const getMyExpenses = () => api.get('/expenses/my');
export const getExpenseSummary = () => api.get('/expenses/summary');
export const updateExpense = (id, data) => api.put(`/expenses/${id}`, data);
export const deleteExpense = (id) => api.delete(`/expenses/${id}`);

export default api;
