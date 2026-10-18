import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useWedding } from '@/context/WeddingContext';
import LandingPage from '@/features/auth/LandingPage';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';
import VerifyEmailPage from '@/features/auth/VerifyEmailPage';
import PendingApproval from '@/features/auth/PendingApproval';
import Dashboard from '@/features/dashboard/Dashboard';
import AddExpense from '@/features/expenses/AddExpense';
import MyExpenses from '@/features/expenses/MyExpenses';
import AllExpenses from '@/features/expenses/AllExpenses';
import Members from '@/features/members/Members';
import Settings from '@/features/settings/Settings';
import Insights from '@/features/insights/Insights';
import AppNav from '@/components/AppNav';

// Standalone email-link pages: reachable signed in or out, no app chrome.
const STANDALONE_PATHS = new Set(['/verify-email', '/reset-password']);

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useWedding();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { isAuthenticated, isPending } = useWedding();
  const { pathname } = useLocation();

  // Awaiting admin approval: nothing of the workspace is reachable yet.
  if (isPending && !STANDALONE_PATHS.has(pathname)) return <PendingApproval />;

  const withNav = isAuthenticated && !STANDALONE_PATHS.has(pathname);

  return (
    <div className={withNav ? 'app-main' : undefined}>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/add" element={<ProtectedRoute><AddExpense /></ProtectedRoute>} />
        <Route path="/my-expenses" element={<ProtectedRoute><MyExpenses /></ProtectedRoute>} />
        <Route path="/all-expenses" element={<ProtectedRoute><AllExpenses /></ProtectedRoute>} />
        <Route path="/members" element={<ProtectedRoute><Members /></ProtectedRoute>} />
        <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {withNav && <AppNav />}
    </div>
  );
}
