import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { fmtDate } from '../utils/format';
import { removeMember } from '../api';

const AVATAR_COLORS = ['#D84381','#7C3AED','#2563EB','#059669','#D97706','#DC2626','#9333EA','#E11D48'];
function getColor(name) { let h=0; for(let i=0;i<(name||'').length;i++) h=name.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }

export default function Members() {
  const navigate = useNavigate();
  const { members, isAdmin, refreshMembers, wedding } = useWedding();
  const { t, tServer, lang } = useLang();

  useEffect(() => { refreshMembers(); }, []);

  const handleRemove = async (id, name) => {
    if (!window.confirm(t('members.confirmRemove', { name }))) return;
    try {
      await removeMember(id);
      toast.success(t('members.removed', { name }));
      refreshMembers();
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('members.errRemove'));
    }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Back">←</button>
        <h1>{t('members.header')}</h1>
      </div>

      {wedding?.joinCode && (
        <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 24 }}>
          <p className="section-title" style={{ marginBottom: 10 }}>{t('members.shareInvite')}</p>
          <div className="text-tnum" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '8px', color: 'var(--primary-light)', marginBottom: 14 }}>
            {wedding.joinCode}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { navigator.clipboard.writeText(wedding.joinCode); toast.success(t('common.codeCopied')); }}
          >
            {t('members.copyCode')}
          </button>
        </div>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 14, fontWeight: 500 }}>
        {members.length === 1 ? t('members.joinedCountOne') : t('members.joinedCount', { count: members.length })}
      </p>

      <div className="stagger">
        {members.map(m => (
          <div key={m._id} className="expense-item">
            <div className="avatar" style={{ background: getColor(m.name), width: 42, height: 42, fontSize: '1rem' }}>
              {(m.name || 'U')[0].toUpperCase()}
            </div>
            <div className="expense-info">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {m.name}
                {m.role === 'admin' && (
                  <span className="pill pill-primary" style={{ fontSize: '0.62rem', padding: '2px 8px' }}>
                    {t('members.adminBadge')}
                  </span>
                )}
              </h4>
              <p>{t('members.joinedDate', { relation: m.relation || t('members.relationFallback'), date: fmtDate(m.createdAt, lang) })}</p>
            </div>
            {isAdmin && m.role !== 'admin' && (
              <button
                onClick={() => handleRemove(m._id, m.name)}
                aria-label="Remove member"
                style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'var(--transition)',
                  flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
