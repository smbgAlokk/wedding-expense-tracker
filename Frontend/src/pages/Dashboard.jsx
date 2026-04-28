import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWedding } from '../context/WeddingContext';

const AVATAR_COLORS = ['#D84381','#7C3AED','#2563EB','#059669','#D97706','#DC2626','#9333EA','#E11D48'];
function getColor(name) { let h=0; for(let i=0;i<(name||'').length;i++) h=name.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
function fmt(n, currency='₹') { if(n>=10000000) return currency+' '+(n/10000000).toFixed(1)+'Cr'; if(n>=100000) return currency+' '+(n/100000).toFixed(1)+'L'; if(n>=1000) return currency+' '+(n/1000).toFixed(1)+'K'; return currency+' '+n.toLocaleString('en-IN'); }

export default function Dashboard() {
  const navigate = useNavigate();
  const { wedding, member, summary, loading, refreshSummary } = useWedding();

  useEffect(() => { refreshSummary(); }, []);

  if (loading && !summary) {
    return (
      <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
        <div className="skeleton" style={{ height: 180, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 100, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  const currency = summary?.currency || wedding?.currency || '₹';
  const totalSpent = summary?.totalSpent || 0;
  const totalBudget = summary?.totalBudget || 0;
  const budgetPercent = summary?.budgetUsedPercent || 0;
  const remaining = summary?.remaining || 0;

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Welcome, {member?.name} 👋</p>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{wedding?.weddingName || 'Wedding Tracker'}</h1>
        </div>
        <div className="avatar" style={{ background: getColor(member?.name), width: 44, height: 44, fontSize: '1rem' }}>
          {(member?.name || 'U')[0]}
        </div>
      </div>

      {/* Total Expense Hero */}
      <div className="glass-card" style={{ textAlign: 'center', marginBottom: 20, padding: 28, background: 'linear-gradient(135deg, rgba(216,67,129,0.12), rgba(124,58,237,0.08))' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1px' }}>Total Wedding Expenses</p>
        <h2 style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--primary-light)', lineHeight: 1.1 }}>
          {fmt(totalSpent, currency)}
        </h2>
        {totalBudget > 0 && (
          <div className="budget-bar-container" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>{budgetPercent}% used</span>
              <span>{remaining >= 0 ? `${fmt(remaining, currency)} left` : `${fmt(Math.abs(remaining), currency)} over!`}</span>
            </div>
            <div className="budget-bar-bg">
              <div className={`budget-bar-fill ${budgetPercent > 100 ? 'over-budget' : ''}`} style={{ width: `${Math.min(budgetPercent, 100)}%` }} />
            </div>
          </div>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 10 }}>{summary?.totalCount || 0} expenses tracked</p>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--primary-light)' }}>{summary?.memberBreakdown?.length || 0}</div>
          <div className="stat-label">Contributors</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-light)' }}>{summary?.categoryBreakdown?.length || 0}</div>
          <div className="stat-label">Categories Used</div>
        </div>
      </div>

      {/* Category Breakdown */}
      {summary?.categoryBreakdown?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 14 }}>Spending by Category</h3>
          {summary.categoryBreakdown.map((cat) => {
            const icon = wedding?.categories?.find(c => c.name === cat._id)?.icon || '📦';
            const pct = totalSpent > 0 ? Math.round((cat.total / totalSpent) * 100) : 0;
            return (
              <div key={cat._id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: '1.4rem', width: 36, textAlign: 'center' }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{cat._id}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{fmt(cat.total, currency)}</span>
                  </div>
                  <div className="budget-bar-bg" style={{ height: 6 }}>
                    <div className="budget-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Contributors */}
      {summary?.memberBreakdown?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 14 }}>🏆 Top Contributors</h3>
          {summary.memberBreakdown.slice(0, 5).map((m, i) => (
            <div key={m._id} className="expense-item">
              <div className="avatar" style={{ background: getColor(m.name), width: 38, height: 38, fontSize: '0.85rem' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (m.name||'U')[0]}
              </div>
              <div className="expense-info">
                <h4>{m.name}</h4>
                <p>{m.relation} • {m.count} expenses</p>
              </div>
              <div className="expense-amount">{fmt(m.total, currency)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Activity */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Recent Activity</h3>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/all-expenses')} style={{ padding: '8px 14px', fontSize: '0.8rem' }}>View All →</button>
        </div>
        {(!summary?.recentExpenses || summary.recentExpenses.length === 0) ? (
          <div className="empty-state">
            <div className="emoji">📝</div>
            <h3>No expenses yet</h3>
            <p>Tap the + button to add the first expense!</p>
          </div>
        ) : (
          summary.recentExpenses.slice(0, 5).map((exp) => {
            const icon = wedding?.categories?.find(c => c.name === exp.category)?.icon || '📦';
            return (
              <div key={exp._id} className="expense-item">
                <div className="expense-icon">{icon}</div>
                <div className="expense-info">
                  <h4>{exp.category}</h4>
                  <p>{exp.memberId?.name || 'Unknown'} • {new Date(exp.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <div className="expense-amount">{fmt(exp.amount, currency)}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Join Code Card */}
      {wedding?.joinCode && (
        <div className="glass-card" style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 6 }}>Share this code with family</p>
          <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '8px', color: 'var(--primary-light)' }}>{wedding.joinCode}</div>
          <button className="btn btn-sm btn-secondary" style={{ marginTop: 12 }} onClick={() => { navigator.clipboard.writeText(wedding.joinCode); import('react-hot-toast').then(m => m.default.success('Code copied!')); }}>
            📋 Copy Code
          </button>
        </div>
      )}
    </div>
  );
}
