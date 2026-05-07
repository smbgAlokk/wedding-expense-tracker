import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { fmtSimple, fmtDate } from '../utils/format';
import { getMyExpenses, deleteExpense } from '../api';
import ExpenseDetailSheet from '../components/ExpenseDetailSheet';

export default function MyExpenses() {
  const navigate = useNavigate();
  const { wedding, refreshSummary } = useWedding();
  const { t, tCat, tServer, lang } = useLang();
  const [expenses, setExpenses] = useState([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const currency = wedding?.currency || '₹';

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const res = await getMyExpenses();
      setExpenses(res.data.data.expenses);
      setTotalSpent(res.data.data.totalSpent);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('my.errLoad'));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchExpenses(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm(t('my.confirmDelete'))) return;
    try {
      await deleteExpense(id);
      toast.success(t('my.deleted'));
      fetchExpenses();
      refreshSummary();
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('my.errDelete'));
    }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Back">←</button>
        <h1>{t('my.header')}</h1>
      </div>

      <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 24, padding: 'var(--space-6)' }}>
        <p className="section-title" style={{ marginBottom: 4 }}>{t('my.totalContribution')}</p>
        <h2 className="text-tnum" style={{ fontSize: 'clamp(2rem, 7vw, 2.6rem)', fontWeight: 800, color: 'var(--primary-light)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {fmtSimple(totalSpent, currency)}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6, fontWeight: 500 }}>
          {expenses.length === 1 ? t('my.expenseCountOne') : t('my.expenseCount', { count: expenses.length })}
        </p>
      </div>

      {loading ? (
        <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 76, marginBottom: 8 }} />)}</div>
      ) : expenses.length === 0 ? (
        <div className="surface-card empty-state" style={{ padding: 'var(--space-12) var(--space-5)' }}>
          <div className="emoji">📝</div>
          <h3>{t('my.empty')}</h3>
          <p style={{ marginBottom: 20 }}>{t('my.emptyHint')}</p>
          <button className="btn btn-primary" onClick={() => navigate('/add')}>{t('my.addBtn')}</button>
        </div>
      ) : (
        <div className="stagger">
          {expenses.map(exp => {
            const icon = wedding?.categories?.find(c => c.name === exp.category)?.icon || '📦';
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
                  <p>{tCat(exp.category)} • {fmtDate(exp.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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
      )}

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        expense={selectedExpense}
        currency={currency}
        categoryIcon={wedding?.categories?.find(c => c.name === selectedExpense?.category)?.icon || '📦'}
        onClose={() => setSelectedExpense(null)}
        onDelete={handleDelete}
        showMember={false}
      />
    </div>
  );
}
