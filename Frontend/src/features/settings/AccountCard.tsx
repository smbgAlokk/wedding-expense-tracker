import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { resendVerification } from '@/api';
import PinSettings from './PinSettings';
import RollText from '@/components/RollText';

// Mirrors RESEND_COOLDOWN_MS in auth.routes.js; the server is the real gate.
const VERIFY_RESEND_COOLDOWN_S = 60;

export default function AccountCard() {
  const { member, refreshMember } = useWedding();
  const { t } = useLang();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const email = member?.email;
  const status = member?.emailVerifiedAt;
  const verified = !!status;

  // While unverified, re-check on mount and whenever the tab regains focus —
  // the email link usually opens in another tab. Verified users cost nothing.
  useEffect(() => {
    if (!email || verified) return;
    refreshMember();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshMember(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [email, verified, refreshMember]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!email) return <PinSettings />; // join-code members sign in with a PIN instead

  const resend = async () => {
    setSending(true);
    try {
      await resendVerification(email);
      toast.success(t('account.linkSent', { email }));
      setCooldown(VERIFY_RESEND_COOLDOWN_S);
    } catch {
      toast.error(t('forgot.errFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="surface-card" style={{ marginBottom: 16, padding: 'var(--space-4) var(--space-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>📧 {t('account.email')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2, wordBreak: 'break-all' }}>{email}</p>
        </div>
        {status !== undefined && (
          <span className={`pill ${verified ? 'pill-success' : 'pill-warning'}`} role="status" style={{ flexShrink: 0 }}>
            {t(verified ? 'account.verified' : 'account.unverified')}
          </span>
        )}
      </div>

      {status === null && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5, margin: '12px 0' }}>
            {t('account.unverifiedHint')}
          </p>
          <button
            className="btn btn-secondary btn-full"
            onClick={resend}
            disabled={sending || cooldown > 0}
            id="btn-account-resend-verification"
          >
            <RollText>{sending ? t('verify.resending') : cooldown > 0 ? t('account.resendIn', { sec: cooldown }) : t('verify.resendBtn')}</RollText>
          </button>
        </>
      )}
    </div>
  );
}
