import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { fmtAmount, fmtDate } from '../utils/format';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import ExpenseDetailSheet from '../components/ExpenseDetailSheet';

const AVATAR_COLORS = ['#D84381','#7C3AED','#2563EB','#059669','#D97706','#DC2626','#9333EA','#E11D48'];
function getColor(name) { let h=0; for(let i=0;i<(name||'').length;i++) h=name.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }

export default function Dashboard() {
  const navigate = useNavigate();
  const { wedding, member, summary, loading, refreshSummary } = useWedding();
  const { t, tCat, lang } = useLang();
  const [selectedExpense, setSelectedExpense] = useState(null);

  useEffect(() => { refreshSummary(); }, []);

  if (loading && !summary) {
    return (
      <div className="container page-content" style={{ paddingTop: 20 }}>
        <div className="skeleton" style={{ height: 60, marginBottom: 24, width: '60%' }} />
        <div className="skeleton" style={{ height: 200, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div className="skeleton" style={{ height: 92 }} />
          <div className="skeleton" style={{ height: 92 }} />
        </div>
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  const currency = summary?.currency || wedding?.currency || '₹';
  const totalSpent = summary?.totalSpent || 0;
  const totalBudget = summary?.totalBudget || 0;
  const budgetPercent = summary?.budgetUsedPercent || 0;
  const remaining = summary?.remaining || 0;
  const totalCount = summary?.totalCount || 0;

  const fmt = (n) => fmtAmount(n, currency, t);

  const hasContributors = summary?.memberBreakdown?.length > 0;
  const hasCategories = summary?.categoryBreakdown?.length > 0;
  const hasRecent = summary?.recentExpenses?.length > 0;

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
            {t('dashboard.welcome', { name: member?.name || '' })}
          </p>
          <h1 className="h1" style={{ marginTop: 4, fontSize: '1.55rem', wordWrap: 'break-word' }}>
            {wedding?.weddingName || t('dashboard.fallbackName')}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <LanguageToggle />
          <ThemeToggle />
          <div className="avatar" style={{ background: getColor(member?.name), width: 44, height: 44, fontSize: '1rem' }}>
            {(member?.name || 'U')[0].toUpperCase()}
          </div>
        </div>
      </header>

      {/* Total Expense Hero */}
      <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 16, padding: 'var(--space-8) var(--space-5)' }}>
        <p className="section-title" style={{ marginBottom: 6 }}>{t('dashboard.totalExpenses')}</p>
        <h2 className="text-tnum" style={{ fontSize: 'clamp(2.4rem, 9vw, 3.2rem)', fontWeight: 800, color: 'var(--primary-light)', lineHeight: 1.05, letterSpacing: '-0.03em' }}>
          {fmt(totalSpent)}
        </h2>
        {totalBudget > 0 && (
          <div className="budget-bar-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
              <span className="text-tnum">{t('dashboard.percentUsed', { percent: budgetPercent })}</span>
              <span className="text-tnum">
                {remaining >= 0
                  ? t('dashboard.amountLeft', { amount: fmt(remaining) })
                  : t('dashboard.amountOver', { amount: fmt(Math.abs(remaining)) })}
              </span>
            </div>
            <div className="budget-bar-bg">
              <div className={`budget-bar-fill ${budgetPercent > 100 ? 'over-budget' : ''}`} style={{ width: `${Math.min(budgetPercent, 100)}%` }} />
            </div>
          </div>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 14, fontWeight: 500 }}>
          {totalCount === 1 ? t('dashboard.expensesTrackedOne') : t('dashboard.expensesTracked', { count: totalCount })}
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        <div className="stat-card stat-card-primary">
          <span className="stat-icon" aria-hidden="true">👥</span>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{summary?.memberBreakdown?.length || 0}</div>
          <div className="stat-label">{t('dashboard.contributors')}</div>
        </div>
        <div className="stat-card stat-card-accent">
          <span className="stat-icon" aria-hidden="true">📂</span>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{summary?.categoryBreakdown?.length || 0}</div>
          <div className="stat-label">{t('dashboard.categoriesUsed')}</div>
        </div>
      </div>

      {/* Two-column on tablet+ for Categories & Top Contributors */}
      <div className="grid-tablet-2">
        {/* Category Breakdown */}
        {hasCategories && (
          <section style={{ marginBottom: 28 }}>
            <h3 className="section-title">{t('dashboard.spendingByCategory')}</h3>
            <div className="surface-card" style={{ padding: 'var(--space-4)' }}>
              {summary.categoryBreakdown.map((cat, idx) => {
                const icon = wedding?.categories?.find(c => c.name === cat._id)?.icon || '📦';
                const pct = totalSpent > 0 ? Math.round((cat.total / totalSpent) * 100) : 0;
                return (
                  <div key={cat._id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 'var(--space-3) 0',
                    borderBottom: idx < summary.categoryBreakdown.length - 1 ? '1px solid var(--divider)' : 'none',
                  }}>
                    <span style={{ fontSize: '1.4rem', width: 32, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tCat(cat._id)}</span>
                        <span className="text-tnum" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(cat.total)}</span>
                      </div>
                      <div className="budget-bar-bg" style={{ height: 5 }}>
                        <div className="budget-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Top Contributors */}
        {hasContributors && (
          <section style={{ marginBottom: 28 }}>
            <h3 className="section-title">{t('dashboard.topContributors')}</h3>
            <div className="stagger">
              {summary.memberBreakdown.slice(0, 5).map((m, i) => (
                <div key={m._id} className={`expense-item ${i === 0 ? 'podium-1' : i === 1 ? 'podium-2' : i === 2 ? 'podium-3' : ''}`}>
                  <div className="avatar" style={{ background: getColor(m.name), width: 42, height: 42, fontSize: '0.95rem' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (m.name || 'U')[0].toUpperCase()}
                  </div>
                  <div className="expense-info">
                    <h4>{m.name}</h4>
                    <p>
                      {m.count === 1
                        ? t('dashboard.contributorMetaOne', { relation: m.relation || t('members.relationFallback') })
                        : t('dashboard.contributorMeta', { relation: m.relation || t('members.relationFallback'), count: m.count })}
                    </p>
                  </div>
                  <div className="expense-amount">{fmt(m.total)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Recent Activity */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="section-title" style={{ marginBottom: 0 }}>{t('dashboard.recentActivity')}</h3>
          {hasRecent && (
            <button className="btn btn-ghost btn-xs" onClick={() => navigate('/all-expenses')}>
              {t('dashboard.viewAll')}
            </button>
          )}
        </div>
        {!hasRecent ? (
          <div className="surface-card empty-state" style={{ padding: 'var(--space-10) var(--space-5)' }}>
            <div className="emoji">📝</div>
            <h3>{t('dashboard.empty')}</h3>
            <p>{t('dashboard.emptyHint')}</p>
          </div>
        ) : (
          <div className="stagger">
            {summary.recentExpenses.slice(0, 5).map((exp) => {
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
                    <p>{exp.memberId?.name || t('common.unknown')} • {fmtDate(exp.createdAt, lang)}</p>
                    {exp.receiptUrl && (
                      <span className="receipt-badge" style={{ marginTop: 4 }}>
                        {t('receipt.badge')}
                      </span>
                    )}
                  </div>
                  <div className="expense-amount">{fmt(exp.amount)}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Join Code Card */}
      {wedding?.joinCode && (
        <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 16 }}>
          <p className="section-title" style={{ marginBottom: 8 }}>{t('dashboard.shareCode')}</p>
          <div className="text-tnum" style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '8px',
            color: 'var(--primary-light)',
            marginBottom: 14,
          }}>
            {wedding.joinCode}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              navigator.clipboard.writeText(wedding.joinCode);
              toast.success(t('common.codeCopied'));
            }}
          >
            {t('dashboard.copyCode')}
          </button>
        </div>
      )}

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        expense={selectedExpense}
        currency={currency}
        categoryIcon={wedding?.categories?.find(c => c.name === selectedExpense?.category)?.icon || '📦'}
        onClose={() => setSelectedExpense(null)}
        showMember={true}
      />
    </div>
  );
}
