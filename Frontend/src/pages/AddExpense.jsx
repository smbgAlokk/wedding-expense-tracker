import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { addExpense } from '../api';

export default function AddExpense() {
  const navigate = useNavigate();
  const { wedding, member, refreshSummary } = useWedding();
  const [step, setStep] = useState(1); // 1=category, 2=amount, 3=details
  const [form, setForm] = useState({ category: '', amount: '', description: '', paidBy: member?.name || '', vendor: '' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const currency = wedding?.currency || '₹';

  const handleSubmit = async () => {
    if (!form.category) return toast.error('Please select a category');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Please enter a valid amount');
    setLoading(true);
    try {
      await addExpense({ ...form, amount: parseFloat(form.amount) });
      toast.success('Expense added! 🎉');
      refreshSummary();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add expense');
    } finally { setLoading(false); }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)}>←</button>
        <h1>Add Expense</h1>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 4, background: s <= step ? 'var(--primary)' : 'var(--bg-elevated)', transition: 'all 0.3s' }} />
        ))}
      </div>

      {/* Step 1: Category */}
      {step === 1 && (
        <div className="animate-in">
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6 }}>What was it for?</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem' }}>Pick a category</p>
          <div className="category-grid">
            {(wedding?.categories || []).map(cat => (
              <button
                key={cat.name}
                className={`category-chip ${form.category === cat.name ? 'active' : ''}`}
                onClick={() => { set('category', cat.name); setTimeout(() => setStep(2), 200); }}
                id={`cat-${cat.name.toLowerCase().replace(/\s/g, '-')}`}
              >
                <span className="emoji">{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Amount */}
      {step === 2 && (
        <div className="animate-in">
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6 }}>How much?</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem' }}>
            <span style={{ background: 'rgba(216,67,129,0.15)', color: 'var(--primary-light)', padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem' }}>
              {wedding?.categories?.find(c => c.name === form.category)?.icon} {form.category}
            </span>
          </p>
          <div style={{ position: 'relative', marginBottom: 24 }}>
            <span style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>{currency}</span>
            <input
              className="form-input form-input-lg"
              type="number"
              placeholder="0"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              autoFocus
              style={{ paddingLeft: 60 }}
              id="input-expense-amount"
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" onClick={() => { if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter an amount'); setStep(3); }} id="btn-next-step3">
            Continue →
          </button>
        </div>
      )}

      {/* Step 3: Details */}
      {step === 3 && (
        <div className="animate-in">
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6 }}>Almost done!</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem' }}>Add a few optional details</p>

          {/* Summary chip */}
          <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: 18 }}>
            <span style={{ fontSize: '0.9rem' }}>
              {wedding?.categories?.find(c => c.name === form.category)?.icon} {form.category}
            </span>
            <span style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary-light)' }}>{currency} {parseFloat(form.amount).toLocaleString('en-IN')}</span>
          </div>

          <div className="form-group">
            <label className="form-label">Short description (optional)</label>
            <input className="form-input" placeholder="e.g., Stage flowers" value={form.description} onChange={e => set('description', e.target.value)} id="input-description" />
          </div>
          <div className="form-group">
            <label className="form-label">Paid by</label>
            <input className="form-input" placeholder={member?.name} value={form.paidBy} onChange={e => set('paidBy', e.target.value)} id="input-paid-by" />
          </div>
          <div className="form-group">
            <label className="form-label">Vendor / Shop (optional)</label>
            <input className="form-input" placeholder="e.g., Sharma Caterers" value={form.vendor} onChange={e => set('vendor', e.target.value)} id="input-vendor" />
          </div>
          <button className="btn btn-primary btn-full btn-lg" onClick={handleSubmit} disabled={loading} id="btn-save-expense" style={{ marginTop: 8 }}>
            {loading ? '⏳ Saving...' : '✅ Save Expense'}
          </button>
        </div>
      )}
    </div>
  );
}
