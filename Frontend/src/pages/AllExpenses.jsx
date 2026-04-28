import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { getExpenses, deleteExpense } from '../api';

function fmt(n, c='₹') { return c+' '+n.toLocaleString('en-IN'); }

export default function AllExpenses() {
  const navigate = useNavigate();
  const { wedding, isAdmin, refreshSummary } = useWedding();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const currency = wedding?.currency || '₹';
  const categories = wedding?.categories || [];

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 30, sortBy: 'createdAt', order: 'desc' };
      if (filter !== 'all') params.category = filter;
      const res = await getExpenses(params);
      setExpenses(res.data.data.expenses);
      setPagination(res.data.data.pagination);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchExpenses(); }, [filter, page]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await deleteExpense(id);
      toast.success('Deleted');
      fetchExpenses();
      refreshSummary();
    } catch (err) { toast.error(err.response?.data?.message || 'Cannot delete'); }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>←</button>
        <h1>All Expenses</h1>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 16, marginBottom: 8 }}>
        <button
          className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setFilter('all'); setPage(1); }}
          style={{ flexShrink: 0, padding: '8px 16px', fontSize: '0.8rem' }}
        >All</button>
        {categories.map(cat => (
          <button
            key={cat.name}
            className={`btn btn-sm ${filter === cat.name ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilter(cat.name); setPage(1); }}
            style={{ flexShrink: 0, padding: '8px 16px', fontSize: '0.8rem' }}
          >{cat.icon} {cat.name}</button>
        ))}
      </div>

      {loading ? (
        <div>{[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 70, marginBottom: 10 }} />)}</div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📊</div>
          <h3>No expenses found</h3>
          <p>{filter !== 'all' ? 'Try a different category filter' : 'No one has added expenses yet'}</p>
        </div>
      ) : (
        <>
          {expenses.map(exp => {
            const icon = categories.find(c => c.name === exp.category)?.icon || '📦';
            return (
              <div key={exp._id} className="expense-item">
                <div className="expense-icon">{icon}</div>
                <div className="expense-info">
                  <h4>{exp.description || exp.category}</h4>
                  <p>
                    {exp.memberId?.name || 'Unknown'}
                    {exp.memberId?.relation ? ` (${exp.memberId.relation})` : ''}
                    {' • '}
                    {new Date(exp.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                  {exp.vendor && <p style={{ color: 'var(--text-muted)' }}>🏪 {exp.vendor}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="expense-amount">{fmt(exp.amount, currency)}</div>
                  {isAdmin && (
                    <button onClick={() => handleDelete(exp._id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.72rem', cursor: 'pointer', marginTop: 4 }}>Delete</button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
              <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {page} / {pagination.pages}
              </span>
              <button className="btn btn-sm btn-secondary" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
