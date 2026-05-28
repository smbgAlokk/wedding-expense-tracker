import { useEffect, useRef, useState, SyntheticEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useLang } from '../context/LanguageContext';
import { useWedding } from '../context/WeddingContext';
import { verifyEmail, resendVerification } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

type Phase = 'verifying' | 'success' | 'invalid';

export default function VerifyEmailPage() {
  const { t, tServer } = useLang();
  const { isAuthenticated } = useWedding();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [phase, setPhase] = useState<Phase>(token ? 'verifying' : 'invalid');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  // StrictMode double-mounts dev components; without this guard the token
  // would be consumed by the first mount and the second mount would always
  // see "invalid" because the now-cleared token row no longer matches.
  const verifiedOnceRef = useRef(false);

  useEffect(() => {
    if (!token || verifiedOnceRef.current) return;
    verifiedOnceRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        await verifyEmail(token);
        if (!cancelled) setPhase('success');
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleResend = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return toast.error(t('verify.resendErrEmail'));
    setResending(true);
    try {
      const res = await resendVerification(resendEmail.trim());
      toast.success(tServer(res.data?.message) || t('verify.resendSent'));
      setResendDone(true);
    } catch {
      // resend-verification is anti-enum on the server — it always 200s for
      // valid email shapes. A non-2xx here means network / CORS, not a logic
      // error. Surface generic copy so the user can retry.
      toast.error(t('forgot.errFailed'));
    } finally {
      setResending(false);
    }
  };

  const wrapper = (children: React.ReactNode) => (
    <div className="container" style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', paddingTop: 32, paddingBottom: 32, position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 8, zIndex: 10 }}>
        <LanguageToggle />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );

  if (phase === 'verifying') {
    return wrapper(
      <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📩</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>{t('verify.verifyingTitle')}</h1>
        <p className="text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.6 }}>{t('verify.verifyingBody')}</p>
      </div>
    );
  }

  if (phase === 'success') {
    return wrapper(
      <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>✅</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>{t('verify.successTitle')}</h1>
        <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.6 }}>{t('verify.successBody')}</p>
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={() => navigate(isAuthenticated ? '/dashboard' : '/')}
          id="btn-verify-continue"
        >
          {t('verify.successCta')}
        </button>
      </div>
    );
  }

  // phase === 'invalid' — also handles "no token" landing
  return wrapper(
    <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>⚠️</div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>{t('verify.invalidTitle')}</h1>
      <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.6 }}>{t('verify.invalidBody')}</p>

      {resendDone ? (
        <div className="glass-card" style={{ padding: 'var(--space-5)', textAlign: 'left' }}>
          <p style={{ fontSize: '0.92rem', lineHeight: 1.6 }}>{t('verify.resendSent')}</p>
        </div>
      ) : (
        <form onSubmit={handleResend} style={{ textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 'var(--space-3)', textAlign: 'center' }}>{t('verify.resendCta')}</h2>
          <div className="form-group">
            <label className="form-label">{t('verify.resendEmailLabel')}</label>
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
            {resending ? t('verify.resending') : t('verify.resendBtn')}
          </button>
        </form>
      )}
    </div>
  );
}
