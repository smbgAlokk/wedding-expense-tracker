import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWedding, getExpenseSummary, getWeddingMembers } from '../api';

const WeddingContext = createContext(null);

// Throttle background (tab-focus) refreshes to avoid hammering the API on rapid
// tab toggles. 15s is short enough that members see admin's category changes
// quickly when they return to the tab, long enough to prevent abuse.
const VISIBILITY_REFRESH_THROTTLE_MS = 15_000;

export function WeddingProvider({ children }) {
  const [member, setMember] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wedding_member'));
    } catch { return null; }
  });

  const [wedding, setWedding] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wedding_data'));
    } catch { return null; }
  });

  const [summary, setSummary] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!localStorage.getItem('wedding_token') && !!member;
  const isAdmin = member?.role === 'admin';

  // Login handler (after create/join)
  const login = useCallback((memberData, weddingData, token) => {
    localStorage.setItem('wedding_token', token);
    localStorage.setItem('wedding_member', JSON.stringify(memberData));
    localStorage.setItem('wedding_data', JSON.stringify(weddingData));
    setMember(memberData);
    setWedding(weddingData);
  }, []);

  // Logout handler
  const logout = useCallback(() => {
    localStorage.removeItem('wedding_token');
    localStorage.removeItem('wedding_member');
    localStorage.removeItem('wedding_data');
    setMember(null);
    setWedding(null);
    setSummary(null);
    setMembers([]);
  }, []);

  // Refresh wedding data
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

  // Refresh expense summary
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

  // Refresh members
  const refreshMembers = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await getWeddingMembers();
      setMembers(res.data.data.members);
    } catch (err) {
      console.error('Failed to refresh members:', err);
    }
  }, [isAuthenticated]);

  // Initial sync on auth — pulls the freshest wedding (including any category
  // changes the admin made), summary, and members. Critical for members whose
  // localStorage was seeded at join time and may be stale after admin edits.
  useEffect(() => {
    if (isAuthenticated) {
      refreshWedding();
      refreshSummary();
      refreshMembers();
    }
  }, [isAuthenticated, refreshWedding, refreshSummary, refreshMembers]);

  // Background sync on tab focus — covers the case where admin updates
  // categories or expenses while a member's tab is in the background.
  // Throttled so rapid tab toggles don't spam the API.
  const lastFocusRefreshRef = useRef(0);
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

  const value = {
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

export function useWedding() {
  const context = useContext(WeddingContext);
  if (!context) {
    throw new Error('useWedding must be used within a WeddingProvider');
  }
  return context;
}
