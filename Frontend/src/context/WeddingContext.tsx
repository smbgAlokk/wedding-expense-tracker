import { createContext, useContext } from 'react';
import type { Wedding, Member, ExpenseSummary } from '../types';

export interface WeddingContextType {
  member: Member | null;
  wedding: Wedding | null;
  summary: ExpenseSummary | null;
  members: Member[];
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (memberData: Member, weddingData: Wedding, token: string) => void;
  logout: () => void;
  refreshWedding: () => Promise<void>;
  refreshSummary: () => Promise<void>;
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
