import { Routes, Route, Navigate } from 'react-router-dom';
import { useWedding } from './context/WeddingContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import AddExpense from './pages/AddExpense';
import MyExpenses from './pages/MyExpenses';
import AllExpenses from './pages/AllExpenses';
import Members from './pages/Members';
import Settings from './pages/Settings';
import BottomNav from './components/BottomNav';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useWedding();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { isAuthenticated } = useWedding();

  return (
    <>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/add" element={<ProtectedRoute><AddExpense /></ProtectedRoute>} />
        <Route path="/my-expenses" element={<ProtectedRoute><MyExpenses /></ProtectedRoute>} />
        <Route path="/all-expenses" element={<ProtectedRoute><AllExpenses /></ProtectedRoute>} />
        <Route path="/members" element={<ProtectedRoute><Members /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {isAuthenticated && <BottomNav />}
    </>
  );
}
