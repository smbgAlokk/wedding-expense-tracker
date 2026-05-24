import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { getCurrentWedding, getExpenseSummary, getWeddingMembers } from '../api';
import type { Wedding, Member, ExpenseSummary } from '../types';
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

  const refreshSummary = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await getExpenseSummary();
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

  const value: WeddingContextType = {
    member,
    wedding,
    summary,
    members,
    loading,
    isAuthenticated,
    isAdmin,
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
