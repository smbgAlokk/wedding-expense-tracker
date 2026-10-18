import { useEffect, useState, SyntheticEvent, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useLang } from '@/context/LanguageContext';
import { useWedding } from '@/context/WeddingContext';
import { verifyEmail, resendVerification } from '@/api';
import { fetchOnce } from '@/utils/dataCache';
import Loader from '@/components/Loader';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import RollText from '@/components/RollText';

type Phase = 'verifying' | 'success' | 'already' | 'error' | 'invalid';

// No response (offline / timeout / cold backend), rate-limited, or 5xx: the
// link may still be good, so offer a retry instead of declaring it invalid.
const isTransient = (err: any): boolean => {
  const status = err?.response?.status;
  return !status || status === 429 || status >= 500;
};

export default function VerifyEmailPage() {
  const { t, tServer } = useLang();
  const { isAuthenticated } = useWedding();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [phase, setPhase] = useState<Phase>(token ? 'verifying' : 'invalid');
  const [attempt, setAttempt] = useState(0);
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  // fetchOnce shares one request per token across StrictMode's mount →
  // unmount → mount, and each mount applies the result only while it is live.
  // Never gate this effect with a run-once ref: the surviving mount would skip
  // and the only result would be dropped by the cancelled first mount.
  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchOnce(`verify-email:${token}`, () => verifyEmail(token).then((r) => !!r.data?.alreadyVerified))
      .then((already) => { if (active) setPhase(already ? 'already' : 'success'); })
      .catch((err) => { if (active) setPhase(isTransient(err) ? 'error' : 'invalid'); });
    return () => { active = false; };
  }, [token, attempt]);

  const retry = () => {
    setPhase('verifying');
    setAttempt((n) => n + 1);
  };

  const handleResend = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return toast.error(t('verify.resendErrEmail'));
    setResending(true);
    try {
      const res = await resendVerification(resendEmail.trim());
      toast.success(tServer(res.data?.message) || t('verify.resendSent'));
      setResendDone(true);
    } catch {
      // The endpoint is anti-enum and always 200s for valid input, so a
      // failure here is network-level — generic copy, user can retry.
      toast.error(t('forgot.errFailed'));
    } finally {
      setResending(false);
    }
  };

  const card = (icon: string, title: string, body: string, children?: ReactNode) => (
    <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }} aria-hidden="true">{icon}</div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>{title}</h1>
      <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.6 }}>{body}</p>
      {children}
    </div>
  );

  let content: ReactNode;
  if (phase === 'verifying') {
    content = <Loader label={t('verify.verifyingTitle')} />;
  } else if (phase === 'success' || phase === 'already') {
    content = card(
      '✅',
      t(phase === 'already' ? 'verify.alreadyTitle' : 'verify.successTitle'),
      t('verify.successBody'),
      <button
        className="btn btn-primary btn-full btn-lg"
        onClick={() => navigate(isAuthenticated ? '/dashboard' : '/', { replace: true })}
        id="btn-verify-continue"
        autoFocus
      >
        <RollText>{t(isAuthenticated ? 'verify.successCtaDashboard' : 'verify.successCta')}</RollText>
      </button>,
    );
  } else if (phase === 'error') {
    content = card(
      '📡',
      t('verify.errorTitle'),
      t('verify.errorBody'),
      <button className="btn btn-primary btn-full btn-lg" onClick={retry} id="btn-verify-retry" autoFocus>
        <RollText>{t('verify.retry')}</RollText>
      </button>,
    );
  } else {
    content = card(
      '⚠️',
      t('verify.invalidTitle'),
      t('verify.invalidBody'),
      resendDone ? (
        <div className="glass-card" style={{ padding: 'var(--space-5)', textAlign: 'left' }}>
          <p style={{ fontSize: '0.92rem', lineHeight: 1.6 }}>{t('verify.resendSent')}</p>
        </div>
      ) : (
        <form className="form-card" onSubmit={handleResend} style={{ textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 'var(--space-3)', textAlign: 'center' }}>{t('verify.resendCta')}</h2>
          <div className="form-group">
            <label className="form-label" htmlFor="input-verify-resend-email">{t('verify.resendEmailLabel')}</label>
            <input
              className="form-input"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              id="input-verify-resend-email"
              autoFocus
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={resending} id="btn-verify-resend" style={{ marginTop: 8 }}>
            <RollText>{resending ? t('verify.resending') : t('verify.resendBtn')}</RollText>
          </button>
        </form>
      ),
    );
  }

  return (
    <div className="container" style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', paddingTop: 32, paddingBottom: 32, position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 8, zIndex: 10 }}>
        <LanguageToggle />
        <ThemeToggle />
      </div>
      {content}
    </div>
  );
}
