import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { fmtSimple, fmtDate } from '../utils/format';
import { getExpenses, deleteExpense } from '../api';
import ExpenseDetailSheet from '../components/ExpenseDetailSheet';

export default function AllExpenses() {
  const navigate = useNavigate();
  const { wedding, isAdmin, refreshSummary } = useWedding();
  const { t, tCat, tServer, lang } = useLang();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
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
      toast.error(tServer(err.response?.data?.message) || t('all.errLoad'));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchExpenses(); }, [filter, page]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('my.confirmDelete'))) return;
    try {
      await deleteExpense(id);
      toast.success(t('all.deleted'));
      fetchExpenses();
      refreshSummary();
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('all.errDelete'));
    }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Back">←</button>
        <h1>{t('all.header')}</h1>
      </div>

      {/* Filter chips — horizontal scroll on mobile */}
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 18,
        marginBottom: 8,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        <button
          className={`btn btn-xs ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setFilter('all'); setPage(1); }}
          style={{ flexShrink: 0 }}
        >{t('all.filterAll')}</button>
        {categories.map(cat => (
          <button
            key={cat.name}
            className={`btn btn-xs ${filter === cat.name ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilter(cat.name); setPage(1); }}
            style={{ flexShrink: 0 }}
          >{cat.icon} {tCat(cat.name)}</button>
        ))}
      </div>

      {loading ? (
        <div>{[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 76, marginBottom: 8 }} />)}</div>
      ) : expenses.length === 0 ? (
        <div className="surface-card empty-state" style={{ padding: 'var(--space-12) var(--space-5)' }}>
          <div className="emoji">📊</div>
          <h3>{t('all.empty')}</h3>
          <p>{filter !== 'all' ? t('all.emptyFiltered') : t('all.emptyAll')}</p>
        </div>
      ) : (
        <>
          <div className="stagger">
            {expenses.map(exp => {
              const icon = categories.find(c => c.name === exp.category)?.icon || '📦';
              return (
                <div
                  key={exp._id}
                  className="expense-item"
                  onClick={() => setSelectedExpense(exp)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedExpense(exp)}
                >
                  <div className="expense-icon">{icon}</div>
                  <div className="expense-info">
                    <h4>{exp.description || tCat(exp.category)}</h4>
                    <p>
                      {exp.memberId?.name || t('common.unknown')}
                      {exp.memberId?.relation ? ` (${exp.memberId.relation})` : ''}
                      {' • '}
                      {fmtDate(exp.createdAt, lang)}
                    </p>
                    {exp.vendor && <p style={{ color: 'var(--text-subtle)', fontSize: '0.74rem', marginTop: 2 }}>🏪 {exp.vendor}</p>}
                    {exp.receiptUrl && (
                      <span className="receipt-badge" style={{ marginTop: 4 }}>
                        {t('receipt.badge')}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="expense-amount">{fmtSimple(exp.amount, currency)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {pagination && pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('all.prev')}</button>
              <span className="text-tnum" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, minWidth: 50, textAlign: 'center' }}>
                {page} / {pagination.pages}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>{t('all.next')}</button>
            </div>
          )}
        </>
      )}

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        expense={selectedExpense}
        currency={currency}
        categoryIcon={categories.find(c => c.name === selectedExpense?.category)?.icon || '📦'}
        onClose={() => setSelectedExpense(null)}
        onDelete={isAdmin ? handleDelete : null}
        showMember={true}
      />
    </div>
  );
}
