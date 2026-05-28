import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { getCurrentWedding, getExpenseSummary, getWeddingMembers } from '../api';
import type {
  Wedding,
  Member,
  ExpenseSummary,
  WorkspaceType,
  WorkspaceFeatures,
} from '../types';
import { DEFAULT_WORKSPACE_TYPE } from '../types';
import { getFeaturesByType } from '../constants/defaultCategories';
import { useLang } from './LanguageContext';
import { WeddingContext, type WeddingContextType } from './WeddingContext';

const VISIBILITY_REFRESH_THROTTLE_MS = 15_000;

interface WeddingProviderProps {
  children: ReactNode;
}

export function WeddingProvider({ children }: WeddingProviderProps) {
  const [member, setMember] = useState<Member | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('wedding_member') || 'null');
    } catch { return null; }
  });

  const [wedding, setWedding] = useState<Wedding | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('wedding_data') || 'null');
    } catch { return null; }
  });

  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const isAuthenticated = !!localStorage.getItem('wedding_token') && !!member;
  const isAdmin = member?.role === 'admin';

  const login = useCallback((memberData: Member, weddingData: Wedding, token: string) => {
    localStorage.setItem('wedding_token', token);
    localStorage.setItem('wedding_member', JSON.stringify(memberData));
    localStorage.setItem('wedding_data', JSON.stringify(weddingData));
    setMember(memberData);
    setWedding(weddingData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('wedding_token');
    localStorage.removeItem('wedding_member');
    localStorage.removeItem('wedding_data');
    setMember(null);
    setWedding(null);
    setSummary(null);
    setMembers([]);
  }, []);

  const refreshWedding = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await getCurrentWedding();
      setWedding(res.data.data.wedding);
      localStorage.setItem('wedding_data', JSON.stringify(res.data.data.wedding));
    } catch (err) {
      console.error('Failed to refresh wedding:', err);
    }
  }, [isAuthenticated]);

  const refreshSummary = useCallback(async (params?: { from?: string; to?: string }) => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await getExpenseSummary(params);
      setSummary(res.data.data);
    } catch (err) {
      console.error('Failed to refresh summary:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const refreshMembers = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await getWeddingMembers();
      setMembers(res.data.data.members);
    } catch (err) {
      console.error('Failed to refresh members:', err);
    }
  }, [isAuthenticated]);

  // Bootstrap data on auth. Deferred via setTimeout so the refreshers' setState calls
  // run outside the effect's synchronous body (avoids cascading-render on mount).
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setTimeout(() => {
      refreshWedding();
      refreshSummary();
      refreshMembers();
    }, 0);
    return () => clearTimeout(id);
  }, [isAuthenticated, refreshWedding, refreshSummary, refreshMembers]);

  const lastFocusRefreshRef = useRef<number>(0);
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < VISIBILITY_REFRESH_THROTTLE_MS) return;
      lastFocusRefreshRef.current = now;
      refreshWedding();
      refreshSummary();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated, refreshWedding, refreshSummary]);

  // Multi-vertical derivation (Phase 0a). Workspace type comes from the
  // wedding document; older payloads created before Phase 0a may lack it, in
  // which case we treat the workspace as a wedding (the legacy default).
  // Features prefer the server-computed `wedding.features` virtual but fall
  // back to the client-side `FEATURES_BY_TYPE` map so the UI stays correct
  // even when the cached payload is stale.
  const workspaceType: WorkspaceType = wedding?.type ?? DEFAULT_WORKSPACE_TYPE;
  const features: WorkspaceFeatures = useMemo(
    () => wedding?.features ?? getFeaturesByType(workspaceType),
    [wedding?.features, workspaceType]
  );

  // tw() — type-aware translation. Looks up `workspace.<type>.<key>` first and
  // falls back to the plain `t(key)` shape if the namespaced variant isn't
  // defined. Phase 0a callers can keep using existing `t('xxx')` strings;
  // Phase 2+ verticals migrate their copy to namespaced keys without breakage.
  const { t } = useLang();
  const tw = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const namespacedKey = `workspace.${workspaceType}.${key}`;
      const namespaced = t(namespacedKey, vars);
      // The i18n helper returns the key verbatim when no translation exists —
      // detect that and fall back to the unprefixed key.
      if (namespaced === namespacedKey) {
        return t(key, vars);
      }
      return namespaced;
    },
    [t, workspaceType]
  );

  const value: WeddingContextType = {
    member,
    wedding,
    summary,
    members,
    loading,
    isAuthenticated,
    isAdmin,
    workspaceType,
    features,
    tw,
    login,
    logout,
    refreshWedding,
    refreshSummary,
    refreshMembers
  };

  return (
    <WeddingContext.Provider value={value}>
      {children}
    </WeddingContext.Provider>
  );
}
