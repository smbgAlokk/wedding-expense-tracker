import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// const API_BASE = import.meta.env.VITE_API_URL || '/api';

const RAW = import.meta.env.VITE_API_URL || '/api';
const API_BASE = RAW.replace(/\/+$/, '').endsWith('/api') ? RAW : `${RAW.replace(/\/+$/, '')}/api`;


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
