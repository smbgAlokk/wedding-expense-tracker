import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import api from './client';

// Optional `from` / `to` ISO bounds scope list + summary to a date range
// (Personal months); Wedding / Trip omit them for lifetime totals.

export const addExpense = (
  data: Record<string, any> | FormData,
  onUploadProgress?: AxiosRequestConfig['onUploadProgress'],
): Promise<AxiosResponse> => {
  const config: AxiosRequestConfig = data instanceof FormData ? { timeout: 60_000, onUploadProgress } : {};
  return api.post('/expenses', data, config);
};
export const getExpenses = (params?: Record<string, any>, signal?: AbortSignal): Promise<AxiosResponse> =>
  api.get('/expenses', { params, signal });
export const getMyExpenses = (params?: Record<string, any>, signal?: AbortSignal): Promise<AxiosResponse> =>
  api.get('/expenses/my', { params, signal });
export const getExpenseSummary = (params?: Record<string, any>): Promise<AxiosResponse> =>
  api.get('/expenses/summary', { params });
export const updateExpense = (id: string, data: Record<string, any>): Promise<AxiosResponse> => api.put(`/expenses/${id}`, data);
export const deleteExpense = (id: string): Promise<AxiosResponse> => api.delete(`/expenses/${id}`);

// /insights: KPIs, breakdowns, trend, day-of-week (L1) + prev-period and
// recurring candidates (L2) in one round-trip. Granularity auto-selects when omitted.
export const getAnalytics = (
  params: {
    from: string;
    to: string;
    granularity?: 'day' | 'month';
    /** Both required to populate `data.prev`. */
    prevFrom?: string;
    prevTo?: string;
  },
  signal?: AbortSignal,
): Promise<AxiosResponse> => api.get('/expenses/analytics', { params, signal });
