import { createContext, useContext } from 'react';
import type { AICoachStatus } from '@/types';

/**
 * AI Coach context — hoisted at app root so the status is fetched ONCE per
 * auth session and shared between every consumer (Settings, CoachSection,
 * future surfaces).
 *
 * Before this hoist, each component fetched independently on mount, which
 * meant tab switches between Insights and Settings could fire `/coach/status`
 * 6-8 times in a few seconds (especially with React 19 StrictMode's
 * double-effect-invoke in dev), tripping the rate limiter.
 *
 * Mutator helpers (enable / disable / joinWaitlist / refresh) update the
 * shared state directly so consumers never have to refetch after their own
 * actions.
 */
export interface AICoachContextValue {
  status: AICoachStatus | null;
  loading: boolean;
  error: string | null;
  /** Force a fresh fetch — used by CoachSection after a streamed reply completes. */
  refresh: () => Promise<void>;
  /** Flip aiCoachEnabled = true via /coach/enable, then update state. */
  enable: () => Promise<void>;
  /** Flip aiCoachEnabled = false via /coach/disable, then update state. */
  disable: () => Promise<void>;
  /** Mark the Member's aiWaitlistJoined = true via /coach/waitlist. */
  joinWaitlist: () => Promise<void>;
}

export const AICoachContext = createContext<AICoachContextValue | undefined>(undefined);

export function useAICoach(): AICoachContextValue {
  const ctx = useContext(AICoachContext);
  if (!ctx) throw new Error('useAICoach must be used inside <AICoachProvider>');
  return ctx;
}
