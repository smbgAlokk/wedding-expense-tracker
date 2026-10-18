import type { AxiosResponse } from 'axios';
import api from './client';
import type { WorkspaceType } from '@/types';

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

// Own profile. `pin` is required (and checked) for join-code members — the name is part of their sign-in.
export const updateProfile = (data: { name: string; pin?: string }): Promise<AxiosResponse> => api.patch('/auth/profile', data);
export const uploadAvatar = (photo: Blob): Promise<AxiosResponse> => {
  const body = new FormData();
  body.append('avatar', photo, 'avatar.jpg');
  return api.put('/auth/avatar', body, { timeout: 60_000 });
};
export const removeAvatar = (): Promise<AxiosResponse> => api.delete('/auth/avatar');

// Account switching between the workspaces this sign-in unlocked (server-side set).
export interface SwitchableAccount {
  memberId: string;
  workspaceName: string;
  type: WorkspaceType;
  role: 'admin' | 'member';
  pending: boolean;
  current: boolean;
}
export const getAccounts = (): Promise<AxiosResponse<{ data: { accounts: SwitchableAccount[] } }>> =>
  api.get('/auth/accounts');
export const switchAccount = (memberId: string): Promise<AxiosResponse> => api.post('/auth/switch', { memberId });

// Cookie-session lifecycle (C-2).
export const getMe = (): Promise<AxiosResponse> => api.get('/auth/me');
export const logoutUser = (): Promise<AxiosResponse> => api.post('/auth/logout');
export const logoutAll = (): Promise<AxiosResponse> => api.post('/auth/logout-all');
