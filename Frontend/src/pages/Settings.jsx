import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { updateWedding } from '../api';

export default function Settings() {
  const navigate = useNavigate();
  const { wedding, member, isAdmin, logout, refreshWedding } = useWedding();
  const [editing, setEditing] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [form, setForm] = useState({
    weddingName: wedding?.weddingName || '',
    partner1: wedding?.coupleNames?.partner1 || '',
    partner2: wedding?.coupleNames?.partner2 || '',
    weddingDate: wedding?.weddingDate ? new Date(wedding.weddingDate).toISOString().split('T')[0] : '',
    totalBudget: wedding?.totalBudget || '',
    currency: wedding?.currency || '₹'
  });
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: '📦' });
  const [categories, setCategories] = useState(wedding?.categories || []);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateWedding({ ...form, totalBudget: parseFloat(form.totalBudget) || 0, categories });
      await refreshWedding();
      toast.success('Settings saved!');
      setEditing(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const addCategory = () => {
    if (!newCat.name.trim()) return toast.error('Enter category name');
    if (categories.find(c => c.name.toLowerCase() === newCat.name.toLowerCase())) return toast.error('Category exists');
    setCategories([...categories, { name: newCat.name.trim(), icon: newCat.icon || '📦', budgetLimit: 0 }]);
    setNewCat({ name: '', icon: '📦' });
  };

  const removeCategory = (name) => {
    setCategories(categories.filter(c => c.name !== name));
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    toast.success('You have left the wedding session');
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>←</button>
        <h1>Settings</h1>
      </div>

      {/* Wedding Info */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>💒 Wedding Details</h3>
          {isAdmin && !editing && (
            <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>Edit</button>
          )}
        </div>

        {editing ? (
          <>
            <div className="form-group">
              <label className="form-label">Wedding Name</label>
              <input className="form-input" value={form.weddingName} onChange={e => set('weddingName', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Partner 1</label>
                <input className="form-input" value={form.partner1} onChange={e => set('partner1', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Partner 2</label>
                <input className="form-input" value={form.partner2} onChange={e => set('partner2', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Wedding Date</label>
              <input className="form-input" type="date" value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Total Budget</label>
                <input className="form-input" type="number" value={form.totalBudget} onChange={e => set('totalBudget', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select className="form-input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option value="₹">₹ INR</option>
                  <option value="$">$ USD</option>
                  <option value="€">€ EUR</option>
                  <option value="£">£ GBP</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving...' : '✅ Save'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.9rem', lineHeight: 2, color: 'var(--text-secondary)' }}>
            <p><strong style={{ color: 'var(--text-primary)' }}>{wedding?.weddingName}</strong></p>
            <p>💑 {wedding?.coupleNames?.partner1} & {wedding?.coupleNames?.partner2}</p>
            <p>📅 {wedding?.weddingDate ? new Date(wedding.weddingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}</p>
            <p>💰 Budget: {wedding?.currency} {(wedding?.totalBudget || 0).toLocaleString('en-IN')}</p>
            {member?.email && <p>📧 {member.email}</p>}
          </div>
        )}
      </div>

      {/* Categories */}
      {isAdmin && (
        <div className="glass-card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>📂 Categories</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {categories.map(cat => (
              <div key={cat.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 20, padding: '6px 14px', fontSize: '0.85rem' }}>
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                <button onClick={() => removeCategory(cat.name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', padding: 0, marginLeft: 4 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="New category" value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem' }} />
            <button className="btn btn-primary btn-sm" onClick={addCategory}>+ Add</button>
          </div>
          {categories.length !== (wedding?.categories || []).length && (
            <button className="btn btn-primary btn-sm btn-full" onClick={handleSave} disabled={saving} style={{ marginTop: 12 }}>
              {saving ? 'Saving...' : 'Save Categories'}
            </button>
          )}
        </div>
      )}

      {/* Join Code */}
      <div className="glass-card" style={{ textAlign: 'center', marginBottom: 20 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 6 }}>Wedding Join Code</p>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '6px', color: 'var(--primary-light)' }}>{wedding?.joinCode}</div>
        <button className="btn btn-sm btn-secondary" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard.writeText(wedding?.joinCode); toast.success('Copied!'); }}>📋 Copy</button>
      </div>

      {/* Members shortcut */}
      <button className="btn btn-secondary btn-full" onClick={() => navigate('/members')} style={{ marginBottom: 12 }}>
        👥 View Family Members
      </button>

      {/* Logout - Opens confirmation modal */}
      <button className="btn btn-danger btn-full" onClick={() => setShowLeaveModal(true)} id="btn-logout" style={{ marginBottom: 40 }}>
        🚪 Leave Wedding
      </button>

      {/* Leave Confirmation Modal */}
      {showLeaveModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
          }}
          onClick={() => setShowLeaveModal(false)}
        >
          <div
            className="glass-card animate-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 380, width: '100%',
              background: 'rgba(20, 12, 35, 0.98)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: 32, textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>👋</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>Leave Wedding?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
              You'll be logged out of <strong>{wedding?.weddingName}</strong>.
              {member?.email ? ' You can log back in anytime with your email.' : ' You can rejoin with the wedding code.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-danger btn-full" onClick={handleLogout} id="btn-confirm-leave">
                Yes, Leave Wedding
              </button>
              <button className="btn btn-secondary btn-full" onClick={() => setShowLeaveModal(false)} id="btn-cancel-leave">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
