import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { fmtDate } from '@/utils/format';
import { removeMember, adminResetMemberPin, decideJoinRequest } from '@/api';
import type { Member } from '@/types';

const AVATAR_COLORS = ['#D84381','#7C3AED','#2563EB','#059669','#D97706','#DC2626','#9333EA','#E11D48'];
function getColor(name) { let h=0; for(let i=0;i<(name||'').length;i++) h=name.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }

// Join-code members (no email) sign in with a PIN the admin can reset.
const usesPin = (m: Member) => m.role === 'member' && !m.email;

const iconBtn = (danger: boolean) => ({
  background: danger ? 'var(--danger-bg)' : 'var(--bg-input)',
  border: `1px solid ${danger ? 'var(--danger-border)' : 'var(--border-light)'}`,
  color: danger ? 'var(--danger)' : 'var(--text-secondary)',
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
});

export default function Members() {
  const navigate = useNavigate();
  const { members, pendingMembers, isAdmin, refreshMembers, wedding } = useWedding();
  const { t, tServer, lang } = useLang();
  const [issued, setIssued] = useState<{ name: string; code: string } | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const handleDecision = async (m: Member, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !window.confirm(t('members.confirmDecline', { name: m.name }))) return;
    setDeciding(m._id);
    try {
      await decideJoinRequest(m._id, decision);
      toast.success(t(decision === 'approve' ? 'members.approved' : 'members.declined', { name: m.name }));
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('members.errDecision'));
    } finally {
      setDeciding(null);
      refreshMembers(); // also clears requests another admin/tab already handled
    }
  };

  useEffect(() => { refreshMembers(); }, [refreshMembers]);

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

  const handleResetPin = async (m: Member) => {
    if (!window.confirm(t('members.confirmResetPin', { name: m.name }))) return;
    try {
      const res = await adminResetMemberPin(m._id);
      setIssued({ name: m.name, code: res.data.data.code });
      refreshMembers();
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('members.errResetPin'));
    }
  };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/settings')} aria-label="Back">←</button>
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

      {isAdmin && pendingMembers.length > 0 && (
        <section style={{ marginBottom: 24 }} aria-label={t('members.requestsTitle', { count: pendingMembers.length })}>
          <p className="section-title" style={{ marginBottom: 10 }}>{t('members.requestsTitle', { count: pendingMembers.length })}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12, lineHeight: 1.5 }}>{t('members.requestsHint')}</p>
          {pendingMembers.map(m => (
            <div key={m._id} className="surface-card" style={{ marginBottom: 10, padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div className="avatar" style={{ background: getColor(m.name), width: 40, height: 40, fontSize: '1rem' }}>
                  {(m.name || 'U')[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, wordBreak: 'break-word' }}>{m.name}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {t('members.requestedDate', { relation: m.relation || t('members.relationFallback'), date: fmtDate(m.updatedAt || m.createdAt, lang) })}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--danger)' }} disabled={deciding === m._id} onClick={() => handleDecision(m, 'reject')}>
                  {t('members.decline')}
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={deciding === m._id} onClick={() => handleDecision(m, 'approve')}>
                  {t('members.approve')}
                </button>
              </div>
            </div>
          ))}
        </section>
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
                {isAdmin && usesPin(m) && !m.pinSetAt && (
                  <span className="pill pill-warning" style={{ fontSize: '0.62rem', padding: '2px 8px' }}>
                    {t('members.noPin')}
                  </span>
                )}
              </h4>
              <p>{t('members.joinedDate', { relation: m.relation || t('members.relationFallback'), date: fmtDate(m.createdAt, lang) })}</p>
            </div>
            {isAdmin && m.role !== 'admin' && (
              <div style={{ display: 'flex', gap: 6 }}>
                {usesPin(m) && (
                  <button
                    onClick={() => handleResetPin(m)}
                    aria-label={t('members.resetPin')}
                    title={t('members.resetPin')}
                    style={iconBtn(false)}
                  >🔑</button>
                )}
                <button onClick={() => handleRemove(m._id, m.name)} aria-label="Remove member" style={iconBtn(true)}>✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {issued && (
        <div className="modal-backdrop" onClick={() => setIssued(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔑</div>
            <h2 className="h2" style={{ marginBottom: 8 }}>{t('members.resetCodeTitle', { name: issued.name })}</h2>
            <div className="text-tnum" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '6px', color: 'var(--primary-light)', margin: '16px 0' }}>
              {issued.code}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 24, lineHeight: 1.55 }}>
              {t('members.resetCodeBody', { name: issued.name })}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-secondary btn-full"
                onClick={() => { navigator.clipboard.writeText(issued.code); toast.success(t('common.copied')); }}
              >
                {t('settings.copy')}
              </button>
              <button className="btn btn-primary btn-full btn-lg" onClick={() => setIssued(null)}>{t('members.done')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
