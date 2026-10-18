import type { AxiosResponse } from 'axios';
import api from './client';

export const loginUser = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/auth/login', data);
export const googleLogin = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/auth/google', data);
export const selectWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/auth/login/select-wedding', data);
export const forgotPassword = (email: string, turnstileToken?: string): Promise<AxiosResponse> =>
  api.post('/auth/forgot-password', { email, turnstileToken });
export const resetPassword = (token: string, password: string): Promise<AxiosResponse> =>
  api.post('/auth/reset-password', { token, password });

// Email verification (H-5). Long timeout: an email click is often the first
// request to a cold backend. resendVerification is anti-enum on the server.
export const verifyEmail = (token: string): Promise<AxiosResponse<{ alreadyVerified?: boolean }>> =>
  api.post('/auth/verify-email', { token }, { timeout: 60_000 });
export const resendVerification = (email: string): Promise<AxiosResponse> =>
  api.post('/auth/resend-verification', { email });

// Join-code members: set (first time) or change their 6-digit PIN.
export const changePin = (data: { currentPin?: string; newPin: string }): Promise<AxiosResponse> => api.put('/auth/pin', data);

// Cookie-session lifecycle (C-2).
export const getMe = (): Promise<AxiosResponse> => api.get('/auth/me');
export const logoutUser = (): Promise<AxiosResponse> => api.post('/auth/logout');
export const logoutAll = (): Promise<AxiosResponse> => api.post('/auth/logout-all');
