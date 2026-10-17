import { createContext, useContext } from 'react';
import type {
  Wedding,
  Member,
  ExpenseSummary,
  WorkspaceType,
  WorkspaceFeatures,
} from '../types';

export interface WeddingContextType {
  member: Member | null;
  wedding: Wedding | null;
  summary: ExpenseSummary | null;
  members: Member[];
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // Multi-vertical (Phase 0a). `workspaceType` is the discriminator selecting
  // which vertical's defaults / features apply. `features` is the derived flag
  // set the UI consults to gate sections (members page, join code, month
  // switcher, etc.) — never check `workspaceType === 'wedding'` in JSX; check a
  // feature flag instead.
  workspaceType: WorkspaceType;
  features: WorkspaceFeatures;
  // Type-aware translation lookup. Resolves `workspace.<type>.<key>` first and
  // falls back to plain `t(key)` if the namespaced version isn't defined —
  // letting Phase 0a callers continue using existing wedding-only keys while
  // future verticals add their own namespaced strings without disruption.
  tw: (key: string, vars?: Record<string, string | number>) => string;
  // C-2 (§14.F): the session token is no longer passed through JS — it's set as
  // an HttpOnly cookie by the server. login() just caches the (non-sensitive)
  // member + wedding for instant render; the cookie carries the auth.
  login: (memberData: Member, weddingData: Wedding) => void;
  logout: () => void;
  refreshWedding: () => Promise<void>;
  // Optional `params` carries an ISO `from`/`to` date range so callers can scope
  // the summary to a calendar month (Personal vertical). When omitted, the
  // backend returns lifetime totals — the legacy Wedding/Trip behaviour.
  refreshSummary: (params?: { from?: string; to?: string }) => Promise<void>;
  refreshMembers: () => Promise<void>;
}

export const WeddingContext = createContext<WeddingContextType | null>(null);

export function useWedding(): WeddingContextType {
  const context = useContext(WeddingContext);
  if (!context) {
    throw new Error('useWedding must be used within a WeddingProvider');
  }
  return context;
}
