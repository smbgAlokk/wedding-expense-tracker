import type { AxiosResponse } from 'axios';
import api from './client';

// Mounted under /weddings until the Phase 0b Workspace rename.
export const createWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/weddings', data);
export const createPersonalWorkspace = (data: Record<string, any>): Promise<AxiosResponse> => api.post('/weddings/personal', data);
export type JoinStatus = 'new' | 'returning' | 'reset_required' | 'use_login';
export const lookupJoin = (data: { joinCode: string; name: string }): Promise<AxiosResponse<{ data: { status: JoinStatus; weddingName: string; requiresApproval: boolean } }>> =>
  api.post('/weddings/join/lookup', data);
export const decideJoinRequest = (memberId: string, decision: 'approve' | 'reject'): Promise<AxiosResponse> =>
  api.post(`/weddings/current/members/${memberId}/${decision}`);
export const joinWedding = (data: { joinCode: string; name: string; pin: string; relation?: string }): Promise<AxiosResponse> =>
  api.post('/weddings/join', data);
export const resetPinWithCode = (data: { joinCode: string; name: string; resetCode: string; pin: string }): Promise<AxiosResponse> =>
  api.post('/weddings/join/reset-pin', data);
export const adminResetMemberPin = (memberId: string): Promise<AxiosResponse<{ data: { code: string; expiresAt: string } }>> =>
  api.post(`/weddings/current/members/${memberId}/pin-reset`);
export const getCurrentWedding = (): Promise<AxiosResponse> => api.get('/weddings/current');
export const updateWedding = (data: Record<string, any>): Promise<AxiosResponse> => api.put('/weddings/current', data);
export const getWeddingMembers = (): Promise<AxiosResponse> => api.get('/weddings/current/members');
export const removeMember = (memberId: string): Promise<AxiosResponse> => api.delete(`/weddings/current/members/${memberId}`);
