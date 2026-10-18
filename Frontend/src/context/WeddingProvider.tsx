import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { getCurrentWedding, getExpenseSummary, getWeddingMembers, getMe, logoutUser, saveLocalAuthCache } from '@/api';
import type {
  Wedding,
  Member,
  ExpenseSummary,
  WorkspaceType,
  WorkspaceFeatures,
} from '@/types';
import { DEFAULT_WORKSPACE_TYPE } from '@/types';
import { getFeaturesByType } from '@/constants/defaultCategories';
import { useLang } from './LanguageContext';
import { WeddingContext, type WeddingContextType } from './WeddingContext';
import { cacheInvalidate, fetchOnce } from '@/utils/dataCache';

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
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // C-2 (§14.F): the JWT is now an HttpOnly cookie, invisible to JS. We can no
  // longer derive auth from a token in localStorage. The cached `member` drives
  // the optimistic initial render; the first API call validates the cookie and
  // the 401 interceptor clears the cache (+ bounces to landing) if it's dead.
  const isAuthenticated = !!member;
  const isAdmin = member?.role === 'admin';
  // Awaiting admin approval: the server blocks every data route, so don't call them.
  const isPending = member?.status === 'pending';
  const canLoad = isAuthenticated && !isPending;

  const login = useCallback((memberData: Member, weddingData: Wedding) => {
    // member + wedding are non-sensitive UX cache only — no token here.
    saveLocalAuthCache(memberData, weddingData);
    setMember(memberData);
    setWedding(weddingData);
  }, []);

  // Another tab switched account or signed out: this tab's screen no longer
  // matches the shared session cookies, so reload into the current session.
  // Same account (e.g. renamed / new photo there): just adopt the fresh copy.
  const memberId = member?._id;
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'wedding_member' && e.key !== null) return;
      let next: Member | null = null;
      try { next = JSON.parse(e.newValue || 'null'); } catch { /* treat as signed out */ }
      if (next?._id !== memberId) window.location.reload();
      else if (next) setMember(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [memberId]);

  const logout = useCallback(() => {
    // Best-effort server-side revocation of this device's refresh token; clear
    // local state regardless of whether the network call succeeds.
    logoutUser().catch(() => {});
    localStorage.removeItem('wedding_token'); // legacy key (pre-C-2)
    localStorage.removeItem('wedding_member');
    localStorage.removeItem('wedding_data');
    setMember(null);
    setWedding(null);
    setSummary(null);
    setMembers([]);
    setPendingMembers([]);
    // Wipe every cached view on logout — on a shared device, the next
    // user must never see leftover analytics / AI quota state from the
    // previous session.
    cacheInvalidate();
  }, []);

  const refreshWedding = useCallback(async () => {
    if (!canLoad) return;
    try {
      const res = await getCurrentWedding();
      setWedding(res.data.data.wedding);
      localStorage.setItem('wedding_data', JSON.stringify(res.data.data.wedding));
    } catch (err) {
      console.error('Failed to refresh wedding:', err);
    }
  }, [canLoad]);

  // Member only: /auth/me's workspace lacks the populated fields /weddings/current returns.
  const refreshMember = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const fresh = await fetchOnce('auth:me', () => getMe().then((res) => res.data.data.member as Member));
      setMember(fresh);
      localStorage.setItem('wedding_member', JSON.stringify(fresh));
    } catch (err) {
      console.error('Failed to refresh member:', err);
    }
  }, [isAuthenticated]);

  const refreshSummary = useCallback(async (params?: { from?: string; to?: string }) => {
    if (!canLoad) return;
    try {
      setLoading(true);
      const res = await getExpenseSummary(params);
      setSummary(res.data.data);
    } catch (err) {
      console.error('Failed to refresh summary:', err);
    } finally {
      setLoading(false);
    }
  }, [canLoad]);

  const refreshMembers = useCallback(async () => {
    if (!canLoad) return;
    try {
      const res = await getWeddingMembers();
      setMembers(res.data.data.members);
      setPendingMembers(res.data.data.pending ?? []);
    } catch (err) {
      console.error('Failed to refresh members:', err);
    }
  }, [canLoad]);

  // Bootstrap data on auth. Deferred via setTimeout so the refreshers' setState calls
  // run outside the effect's synchronous body (avoids cascading-render on mount).
  // Re-runs when approval lands (canLoad flips true), loading the full workspace.
  useEffect(() => {
    if (!canLoad) return;
    const id = setTimeout(() => {
      refreshWedding();
      refreshSummary();
      refreshMembers();
    }, 0);
    return () => clearTimeout(id);
  }, [canLoad, refreshWedding, refreshSummary, refreshMembers]);

  const lastFocusRefreshRef = useRef<number>(0);
  useEffect(() => {
    if (!canLoad) return;

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < VISIBILITY_REFRESH_THROTTLE_MS) return;
      lastFocusRefreshRef.current = now;
      refreshWedding();
      refreshSummary();
      if (isAdmin) refreshMembers(); // surfaces new join requests
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [canLoad, isAdmin, refreshWedding, refreshSummary, refreshMembers]);

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
    pendingMembers,
    loading,
    isAuthenticated,
    isAdmin,
    isPending,
    workspaceType,
    features,
    tw,
    login,
    logout,
    refreshWedding,
    refreshMember,
    refreshSummary,
    refreshMembers
  };

  return (
    <WeddingContext.Provider value={value}>
      {children}
    </WeddingContext.Provider>
  );
}
