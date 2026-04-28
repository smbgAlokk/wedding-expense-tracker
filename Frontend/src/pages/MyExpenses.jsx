import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { getMyExpenses, deleteExpense } from '../api';

function fmt(n, c='₹') { return c+' '+n.toLocaleString('en-IN'); }

export default function MyExpenses() {
  const navigate = useNavigate();
  const { wedding, member, refreshSummary } = useWedding();
  const [expenses, setExpenses] = useState([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const currency = wedding?.currency || '₹';

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const res = await getMyExpenses();
      setExpenses(res.data.data.expenses);
      setTotalSpent(res.data.data.totalSpent);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchExpenses(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await deleteExpense(id);
      toast.success('Expense deleted');
      fetchExpenses();
      refreshSummary();
    } catch (err) { toast.error('Failed to delete'); }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>←</button>
        <h1>My Expenses</h1>
      </div>

      <div className="glass-card" style={{ textAlign: 'center', marginBottom: 24, padding: 20, background: 'linear-gradient(135deg, rgba(216,67,129,0.1), rgba(124,58,237,0.06))' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 4 }}>My Total Contribution</p>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary-light)' }}>{fmt(totalSpent, currency)}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>{expenses.length} expenses</p>
      </div>

      {loading ? (
        <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 70, marginBottom: 10 }} />)}</div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📝</div>
          <h3>No expenses yet</h3>
          <p>Add your first expense to start tracking!</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/add')}>+ Add Expense</button>
        </div>
      ) : (
        expenses.map(exp => {
          const icon = wedding?.categories?.find(c => c.name === exp.category)?.icon || '📦';
          return (
            <div key={exp._id} className="expense-item" style={{ position: 'relative' }}>
              <div className="expense-icon">{icon}</div>
              <div className="expense-info">
                <h4>{exp.description || exp.category}</h4>
                <p>{exp.category} • {new Date(exp.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                {exp.vendor && <p style={{ color: 'var(--text-muted)' }}>🏪 {exp.vendor}</p>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="expense-amount">{fmt(exp.amount, currency)}</div>
                <button onClick={() => handleDelete(exp._id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer', marginTop: 4 }}>Delete</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
