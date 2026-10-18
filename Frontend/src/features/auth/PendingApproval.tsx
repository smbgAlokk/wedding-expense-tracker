import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { getMe } from '@/api';
import { pinErrorMessage } from '@/utils/pinErrors';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import AccountSwitcher from '@/features/settings/AccountSwitcher';
import type { Member } from '@/types';
import RollText from '@/components/RollText';

const POLL_MS = 15_000;

// Shown instead of the app while the admin hasn't approved this member. The
// server blocks every data route for pending members; this screen only probes
// /auth/me and lets them in the moment the status flips.
export default function PendingApproval() {
  const { wedding, login, logout } = useWedding();
  const { t, tServer } = useLang();
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);

  const check = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (manual) setChecking(true);
    try {
      const fresh: Member = (await getMe()).data.data.member;
      if (fresh.status !== 'pending' && wedding) {
        login(fresh, wedding); // full workspace loads once the app mounts
        toast.success(t('pending.approved'));
      } else if (manual) {
        toast(t('pending.stillWaiting'), { icon: '⏳' });
      }
    } catch (err: any) {
      // 401 after the client's silent refresh = declined (or session gone).
      if (err?.response?.status === 401) {
        logout();
        toast.error(pinErrorMessage(err, t, tServer, 'pending.sessionEnded'));
      }
    } finally {
      inFlight.current = false;
      if (manual) setChecking(false);
    }
  }, [wedding, login, logout, t, tServer]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') check(); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [check]);

  return (
    <div className="container" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 32, paddingBottom: 32, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 8, zIndex: 10 }}>
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto', textAlign: 'center' }} role="status" aria-live="polite">
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }} aria-hidden="true">⏳</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>{t('pending.title')}</h1>
        <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 12, lineHeight: 1.6 }}>
          {t('pending.body', { wedding: wedding?.weddingName || '' })}
        </p>
        <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: 28, lineHeight: 1.6 }}>{t('pending.hint')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary btn-full btn-lg" onClick={() => check(true)} disabled={checking} id="btn-pending-check">
            <RollText>{checking ? t('join.checking') : t('pending.checkNow')}</RollText>
          </button>
          <button className="btn btn-ghost btn-full" onClick={logout} id="btn-pending-signout"><RollText>{t('settings.signOut')}</RollText></button>
        </div>
        <div style={{ marginTop: 24, textAlign: 'left' }}>
          <AccountSwitcher />
        </div>
      </div>
    </div>
  );
}
