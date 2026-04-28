import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000
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
export const addExpense = (data) => api.post('/expenses', data);
export const getExpenses = (params) => api.get('/expenses', { params });
export const getMyExpenses = () => api.get('/expenses/my');
export const getExpenseSummary = () => api.get('/expenses/summary');
export const updateExpense = (id, data) => api.put(`/expenses/${id}`, data);
export const deleteExpense = (id) => api.delete(`/expenses/${id}`);

export default api;
