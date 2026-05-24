// Core Business Models for Wedding Expense Tracker

export interface Category {
  name: string;
  icon: string;
  budgetLimit?: number;
}

export interface Member {
  _id: string;
  name: string;
  email?: string;
  role: 'admin' | 'member';
  relation?: string;
  joinedAt?: string;
  createdAt?: string;
}

export interface Wedding {
  _id: string;
  name: string;
  weddingName?: string;
  coupleNames?: { partner1: string; partner2: string };
  partner1: string;
  partner2: string;
  weddingDate: string;
  totalBudget?: number;
  currency: string;
  joinCode: string;
  categories: Category[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Expense {
  _id: string;
  weddingId: string | Wedding;
  memberId: Member; // Can be populated
  amount: number;
  category: string;
  description?: string;
  vendor?: string;
  receiptUrl?: string;
  receiptPublicId?: string;
  createdAt: string;
  updatedAt?: string;
}

// API Responses
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

// One option in the multi-wedding picker (one email → several weddings).
export interface WeddingOption {
  memberId: string;
  weddingName: string;
  role: 'admin' | 'member';
  joinCode: string;
}

// Payload returned by the auth/wedding endpoints (login, google, create, join,
// select). Either a single authenticated session, or a multi-wedding choice.
export interface AuthResult {
  member?: Member;
  wedding?: Wedding;
  token?: string;
  message?: string;
  multipleWeddings?: boolean;
  weddings?: WeddingOption[];
}

export interface ExpenseSummary {
  totalSpent: number;
  totalBudget?: number;
  budgetUsedPercent?: number;
  remaining?: number;
  totalCount?: number;
  currency?: string;
  categoryBreakdown: Array<{ _id: string; total: number; count: number }>;
  memberBreakdown: Array<{
    _id: string;
    total: number;
    count: number;
    name: string;
    relation: string;
  }>;
  recentExpenses?: Expense[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  pages: number;
  limit: number;
}
