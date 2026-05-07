import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { fmtDate } from '../utils/format';
import { updateWedding } from '../api';
import { getMissingDefaults } from '../constants/defaultCategories';
import LanguageToggle from '../components/LanguageToggle';
import ThemeToggle from '../components/ThemeToggle';

export default function Settings() {
  const navigate = useNavigate();
  const { wedding, member, isAdmin, logout, refreshWedding } = useWedding();
  const { t, tCat, tServer, lang } = useLang();
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
      toast.success(t('settings.savedOk'));
      setEditing(false);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('settings.errSave'));
    } finally { setSaving(false); }
  };

  const addCategory = () => {
    if (!newCat.name.trim()) return toast.error(t('settings.errCategoryName'));
    if (categories.find(c => c.name.toLowerCase() === newCat.name.toLowerCase())) return toast.error(t('settings.errCategoryExists'));
    setCategories([...categories, { name: newCat.name.trim(), icon: newCat.icon || '📦', budgetLimit: 0 }]);
    setNewCat({ name: '', icon: '📦' });
  };

  const removeCategory = (name) => {
    setCategories(categories.filter(c => c.name !== name));
  };

  // Compute which canonical defaults are missing from the current list.
  // Recomputed on every render — cheap (≤20 items) and always reflects state.
  const missingDefaults = getMissingDefaults(categories);

  const addMissingDefaults = () => {
    if (missingDefaults.length === 0) return;
    const newOnes = missingDefaults.map(d => ({ ...d, budgetLimit: 0 }));
    setCategories([...categories, ...newOnes]);
    toast.success(t('settings.suggestedCategoriesAdded', { count: newOnes.length }));
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    toast.success(t('settings.leftSession'));
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Back">←</button>
        <h1>{t('settings.header')}</h1>
      </div>

      {/* Preferences row — language + theme */}
      <div className="surface-card" style={{ marginBottom: 16, padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>🌐 {t('settings.languageLabel')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
            {lang === 'hi' ? 'हिन्दी' : 'English'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>

      {/* Wedding Info */}
      <div className="surface-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{t('settings.weddingDetails')}</h3>
          {isAdmin && !editing && (
            <button className="btn btn-secondary btn-xs" onClick={() => setEditing(true)}>{t('common.edit')}</button>
          )}
        </div>

        {editing ? (
          <>
            <div className="form-group">
              <label className="form-label">{t('settings.weddingName')}</label>
              <input className="form-input" value={form.weddingName} onChange={e => set('weddingName', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">{t('settings.partner1')}</label>
                <input className="form-input" value={form.partner1} onChange={e => set('partner1', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.partner2')}</label>
                <input className="form-input" value={form.partner2} onChange={e => set('partner2', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('settings.weddingDate')}</label>
              <input className="form-input" type="date" value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">{t('settings.totalBudget')}</label>
                <input className="form-input" type="number" inputMode="decimal" value={form.totalBudget} onChange={e => set('totalBudget', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.currency')}</label>
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
                {saving ? t('settings.saving') : t('settings.saveBtn')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.92rem', lineHeight: 1.9, color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{wedding?.weddingName}</p>
            <p>{t('settings.coupleLabel', { p1: wedding?.coupleNames?.partner1 || '', p2: wedding?.coupleNames?.partner2 || '' })}</p>
            <p>{t('settings.dateLabel', { date: wedding?.weddingDate ? fmtDate(wedding.weddingDate, lang, { day: 'numeric', month: 'long', year: 'numeric' }) : t('common.notSet') })}</p>
            <p className="text-tnum">{t('settings.budgetLabel', { currency: wedding?.currency || '₹', amount: (wedding?.totalBudget || 0).toLocaleString('en-IN') })}</p>
            {member?.email && <p style={{ wordBreak: 'break-all' }}>{t('settings.emailLabel', { email: member.email })}</p>}
          </div>
        )}
      </div>

      {/* Categories */}
      {isAdmin && (
        <div className="surface-card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>{t('settings.categoriesHeader')}</h3>

          {missingDefaults.length > 0 && (
            <button
              type="button"
              onClick={addMissingDefaults}
              className="btn btn-secondary btn-sm btn-full"
              style={{
                marginBottom: 14,
                background: 'var(--primary-100)',
                borderColor: 'var(--primary-200)',
                color: 'var(--primary)',
                fontWeight: 600,
              }}
            >
              {t('settings.suggestedCategories', { count: missingDefaults.length })}
            </button>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {categories.map(cat => (
              <div key={cat.name} className="pill" style={{ paddingRight: 8 }}>
                <span>{cat.icon}</span>
                <span>{tCat(cat.name)}</span>
                <button onClick={() => removeCategory(cat.name)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 0 2px', marginLeft: 2, lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder={t('settings.newCategoryPlaceholder')} value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} style={{ flex: 1, minHeight: 44, fontSize: '0.9rem' }} />
            <button className="btn btn-primary btn-sm" onClick={addCategory}>{t('settings.addCategory')}</button>
          </div>
          {categories.length !== (wedding?.categories || []).length && (
            <button className="btn btn-primary btn-sm btn-full" onClick={handleSave} disabled={saving} style={{ marginTop: 12 }}>
              {saving ? t('settings.saving') : t('settings.saveCategories')}
            </button>
          )}
        </div>
      )}

      {/* Join Code */}
      <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 16 }}>
        <p className="section-title" style={{ marginBottom: 8 }}>{t('settings.joinCode')}</p>
        <div className="text-tnum" style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '7px', color: 'var(--primary-light)', marginBottom: 12 }}>
          {wedding?.joinCode}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => { navigator.clipboard.writeText(wedding?.joinCode); toast.success(t('common.copied')); }}
        >
          {t('settings.copy')}
        </button>
      </div>

      {/* Members shortcut */}
      <button className="btn btn-secondary btn-full" onClick={() => navigate('/members')} style={{ marginBottom: 12 }}>
        {t('settings.viewMembers')}
      </button>

      {/* Logout */}
      <button className="btn btn-danger btn-full" onClick={() => setShowLeaveModal(true)} id="btn-logout" style={{ marginBottom: 40 }}>
        {t('settings.leave')}
      </button>

      {/* Leave Confirmation Modal */}
      {showLeaveModal && (
        <div className="modal-backdrop" onClick={() => setShowLeaveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>👋</div>
            <h2 className="h2" style={{ marginBottom: 8 }}>{t('settings.leaveTitle')}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.55 }}>
              {t(member?.email ? 'settings.leaveBodyEmail' : 'settings.leaveBodyCode', { wedding: wedding?.weddingName || '' })}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-danger btn-full btn-lg" onClick={handleLogout} id="btn-confirm-leave">
                {t('settings.leaveYes')}
              </button>
              <button className="btn btn-ghost btn-full" onClick={() => setShowLeaveModal(false)} id="btn-cancel-leave">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
