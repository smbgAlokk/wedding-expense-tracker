import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useWedding } from './WeddingContext';
import {
  getAICoachStatus,
  enableAICoach,
  disableAICoach,
  joinAIWaitlist,
} from '../api';
import type { AICoachStatus } from '../types';
import { AICoachContext, type AICoachContextValue } from './AICoachContext';

interface Props {
  children: ReactNode;
}

/**
 * Provider that owns AI Coach status for the whole app.
 *
 * Fetch lifecycle:
 *   • Fires ONCE per auth session, the first time both `isAuthenticated`
 *     AND `features.monthlyBudget` become true. A ref guards against the
 *     React 19 StrictMode dev double-invoke and against future re-renders
 *     re-triggering the same fetch.
 *   • The ref is reset on logout (isAuthenticated → false) so the next
 *     login fetches fresh status.
 *   • Refresh is otherwise driven by EVENTS, not polling: enable/disable
 *     mutations update state directly from their server response, and
 *     CoachSection calls `refresh()` after each streamed reply to pull a
 *     new quota count.
 *
 * The Wedding/Trip cases short-circuit — status stays null and no fetch
 * fires, since AI Coach is Personal-only.
 */
export function AICoachProvider({ children }: Props) {
  const { isAuthenticated, features } = useWedding();
  const [status, setStatus] = useState<AICoachStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether we've already initiated an initial fetch this session.
  // useRef (not useState) so StrictMode's double-invoke doesn't reset it
  // between effect runs; we only zero it out explicitly on logout.
  const fetchInitiatedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !features.monthlyBudget) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAICoachStatus();
      setStatus(res.data?.data ?? null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, features.monthlyBudget]);

  // Initial-load effect. Carefully guarded: runs once per (login,
  // monthlyBudget-enabled) transition, not on every render.
  useEffect(() => {
    if (!isAuthenticated || !features.monthlyBudget) {
      // Logout OR switching to a Wedding/Trip workspace → reset everything
      // so the next Personal login fetches fresh.
      fetchInitiatedRef.current = false;
      setStatus(null);
      setError(null);
      return;
    }
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;
    void refresh();
  }, [isAuthenticated, features.monthlyBudget, refresh]);

  // Mutators — each updates state directly from the server's response,
  // saving the extra round-trip a naive "mutate then refetch" pattern would
  // need. The backend's enable/disable handlers return the updated status
  // payload (same shape as /status) precisely so we can do this.
  const enable = useCallback(async () => {
    const res = await enableAICoach();
    setStatus(res.data?.data ?? null);
    setError(null);
  }, []);

  const disable = useCallback(async () => {
    const res = await disableAICoach();
    setStatus(res.data?.data ?? null);
    setError(null);
  }, []);

  const joinWaitlist = useCallback(async () => {
    await joinAIWaitlist();
    // /waitlist returns just { success, message } so we patch locally
    // rather than overwriting the whole status object.
    setStatus((s) => (s ? { ...s, waitlistJoined: true } : s));
  }, []);

  const value: AICoachContextValue = {
    status,
    loading,
    error,
    refresh,
    enable,
    disable,
    joinWaitlist,
  };

  return <AICoachContext.Provider value={value}>{children}</AICoachContext.Provider>;
}
