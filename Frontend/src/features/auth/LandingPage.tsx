import { useState, useEffect, useRef, type SyntheticEvent } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { createWedding, createPersonalWorkspace, lookupJoin, joinWedding, resetPinWithCode, loginUser, googleLogin, selectWedding, forgotPassword } from '@/api';
import PinField from '@/components/PinField';
import BrandLogo from '@/components/BrandLogo';
import Loader from '@/components/Loader';
import { pinErrorMessage, pinFormError } from '@/utils/pinErrors';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import TurnstileWidget, { isTurnstileEnabled } from './TurnstileWidget';
import type { Member, Wedding, AuthResult, WeddingOption } from '@/types';
import RollText from '@/components/RollText';

// Which auth surface is showing (null = the landing hero, which now embeds the
// multi-vertical type picker directly so users see all options upfront —
// 'create' is the Wedding form, 'create-personal' is the Personal-vertical form.
type Mode = 'create' | 'create-personal' | 'join' | 'login' | 'select-wedding' | 'forgot';
// Caches an authenticated member + wedding into context/localStorage. C-2
// (§14.F): no token — the session is set as an HttpOnly cookie by the server.
type LoginFn = (member: Member, wedding: Wedding) => void;
// Receives a verified Google ID-token credential string.
type CredentialHandler = (credential: string) => void;
// Receives a successful auth payload (single- or multi-wedding).
type AuthSuccessHandler = (data: AuthResult) => void;
type GoogleButtonText = 'continue_with' | 'signup_with' | 'signin_with';

// ─── Google Identity Services — module-level singleton ──────────────────────
//
// GSI is a global on `window.google.accounts.id`. Every `initialize()` call
// replaces the callback registered on that singleton, so re-initializing per
// component mount (a) emits a console warning and (b) is genuinely unsafe — a
// late popup response could fire the *previous* component's callback.
//
// Strategy: initialize exactly once per page load, with a stable callback that
// dispatches to whichever <GoogleAuthButton/> is currently mounted. Each button
// just swaps the pointer on mount/unmount. No re-init, no warnings, no leaks.
let gsiInitPromise: Promise<any> | null = null;
let activeCredentialHandler: CredentialHandler | null = null;

function loadGsi(clientId: string): Promise<any> {
  if (gsiInitPromise) return gsiInitPromise;
  gsiInitPromise = new Promise((resolve, reject) => {
    const start = Date.now();
    const MAX_WAIT_MS = 8000; // GSI script is async-defer; give it a generous window
    const poll = () => {
      const gsi = (window as any).google?.accounts?.id;
      if (gsi) {
        gsi.initialize({
          client_id: clientId,
          callback: (response: any) => {
            // Dispatch to whoever's currently mounted. Silently drop if no one
            // is — happens if the user closes the popup after navigating away.
            if (activeCredentialHandler && response?.credential) {
              activeCredentialHandler(response.credential);
            }
          },
        });
        resolve(gsi);
        return;
      }
      if (Date.now() - start > MAX_WAIT_MS) {
        reject(new Error('Google Identity Services failed to load within 8s'));
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
  // If the initial promise rejects, allow a future mount to retry instead of
  // permanently disabling Google Sign-In for the session.
  gsiInitPromise.catch(() => { gsiInitPromise = null; });
  return gsiInitPromise;
}

// Reusable Google Identity Services button. Renders Google's official button and
// forwards the verified credential to onCredential.
function GoogleAuthButton({ onCredential, text = 'continue_with' }: { onCredential: CredentialHandler; text?: GoogleButtonText }) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    () => (import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'loading' : 'unavailable')
  );

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    // Claim the GSI callback slot while mounted. If another button is already
    // mounted (transient view switch), the most recently mounted one wins —
    // which matches the on-screen reality.
    const previousHandler = activeCredentialHandler;
    activeCredentialHandler = onCredential;
    let cancelled = false;

    loadGsi(clientId)
      .then((gsi) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        const width = Math.min(containerRef.current.offsetWidth || 320, 400);
        gsi.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'center',
          width,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
      // Restore whatever handler was registered before us (usually null). Don't
      // null-out unconditionally — under React StrictMode the effect runs twice
      // and we'd wipe our own newly-set handler.
      if (activeCredentialHandler === onCredential) {
        activeCredentialHandler = previousHandler;
      }
    };
  }, [onCredential, text]);

  return (
    <div>
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
      {status === 'loading' && <Loader size="sm" label={t('login.googleLoading')} />}
      {status === 'unavailable' && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 8 }}>
          {t('login.googleConfigHint')}
        </p>
      )}
    </div>
  );
}

function OrDivider() {
  const { t } = useLang();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>{t('common.or')}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
    </div>
  );
}

export default function LandingPage() {
  const [mode, setMode] = useState<Mode | null>(null);
  const { login } = useWedding();
  const { t, tServer } = useLang();
  const navigate = useNavigate();

  const [weddingList, setWeddingList] = useState<WeddingOption[] | null>(null);
  // Security audit C-1 (2026-05-28): when the login response is multi-wedding,
  // the server now mints a short-lived (5 min) selector token that must be
  // replayed on the follow-up /select-wedding request. Stored here in component
  // state only — NOT in localStorage. If the page unmounts, the token is lost
  // and the user falls back to logging in again, which is the safe default.
  const [selectorToken, setSelectorToken] = useState<string | null>(null);

  const handleLoginSuccess = (data: AuthResult) => {
    if (data.multipleWeddings) {
      setWeddingList(data.weddings);
      setSelectorToken(data.selectorToken || null);
      setMode('select-wedding');
    } else {
      login(data.member, data.wedding);
      toast.success(data.member.status === 'pending' ? t('pending.requestSent') : tServer(data.message) || t('login.welcomeBack'));
      navigate('/dashboard');
    }
  };

  const handleSelectWedding = async (memberId: string) => {
    if (!selectorToken) {
      // Defence in depth: the server will 401 without it, but bail early
      // with a clear message rather than letting the user click and wait.
      toast.error(t('select.errExpired'));
      setMode('login');
      return;
    }
    try {
      const res = await selectWedding({ memberId, selectorToken });
      const { wedding, member } = res.data.data;
      login(member, wedding);
      toast.success(member.status === 'pending' ? t('pending.requestSent') : t('select.entered', { name: wedding.weddingName }));
      navigate('/dashboard');
    } catch (err) {
      // 401 means the selector token expired or the memberId wasn't in the
      // allowlist — either way the multi-wedding flow needs to restart from
      // /login. Route back to the login form with a clear message instead of
      // leaving the user stuck on a screen whose tokens are dead.
      if (err.response?.status === 401) {
        setSelectorToken(null);
        setWeddingList(null);
        setMode('login');
        toast.error(tServer(err.response?.data?.message) || t('select.errExpired'));
        return;
      }
      toast.error(tServer(err.response?.data?.message) || t('select.errFailed'));
    }
  };

  return (
    <div className="auth-shell">
      {/* Architectural background watermark — decorative, skipped by screen
          readers. Neutral words now that the app is multi-vertical (Phase 2). */}
      <div className="auth-watermark" aria-hidden="true">
        <span className="aw-word aw-1">EVERY</span>
        <span className="aw-word aw-2">RUPEE</span>
      </div>

      <div className="auth-toggles">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      {!mode && <HeroSection onSelect={setMode} onGoogleSuccess={handleLoginSuccess} />}

      {mode && (
        <div className={`auth-panel auth-panel-form animate-scale${mode === 'create' || mode === 'create-personal' ? ' auth-panel-wide' : ''}`}>
          {mode === 'create' && <CreateForm onBack={() => setMode(null)} login={login} navigate={navigate} />}
          {mode === 'create-personal' && <CreatePersonalForm onBack={() => setMode(null)} login={login} navigate={navigate} />}
          {mode === 'join' && <JoinForm onBack={() => setMode(null)} login={login} navigate={navigate} onAuthSuccess={handleLoginSuccess} onSwitchToLogin={() => setMode('login')} />}
          {mode === 'login' && <LoginForm onBack={() => setMode(null)} onSuccess={handleLoginSuccess} onForgot={() => setMode('forgot')} />}
          {mode === 'forgot' && <ForgotPasswordForm onBack={() => setMode('login')} />}
          {mode === 'select-wedding' && <SelectWeddingForm weddings={weddingList} onSelect={handleSelectWedding} onBack={() => setMode('login')} />}
        </div>
      )}
    </div>
  );
}

function HeroSection({ onSelect, onGoogleSuccess }: { onSelect: (mode: Mode) => void; onGoogleSuccess: AuthSuccessHandler }) {
  const { t, tServer } = useLang();

  // Returning members: one tap to sign in. New users (no account yet) get a
  // friendly nudge to create a wedding or join with a code.
  const handleHeroGoogle = async (credential: string) => {
    try {
      const res = await googleLogin({ credential });
      onGoogleSuccess(res.data.data);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('login.errGoogleFailed'));
    }
  };

  return (
    <div className="auth-hero animate-in">
      {/* LEFT — brand / showcase panel */}
      <div className="auth-brand">
        <div className="landing-emblem">
          <span className="landing-emblem-glow" aria-hidden="true" />
          <span className="landing-emblem-ring" aria-hidden="true" />
          <BrandLogo className="landing-emblem-icon" size="64%" />
        </div>

        <div className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          {t('landing.eyebrow')}
        </div>

        <h1 className="auth-headline">
          {t('landing.title1')} <span className="grad">{t('landing.title2')}</span>
        </h1>

        <p className="auth-tagline">
          {t('landing.subtitle1')} {t('landing.subtitle2')}
        </p>

        {/* Trust stats — quick reassurance for non-tech family members */}
        <div className="auth-stats">
          <span className="auth-stat"><span className="auth-stat-ico" aria-hidden="true">👨‍👩‍👧‍👦</span>{t('landing.trustFamily')}</span>
          <span className="auth-stat"><span className="auth-stat-ico" aria-hidden="true">🪙</span>{t('landing.trustRupee')}</span>
          <span className="auth-stat"><span className="auth-stat-ico" aria-hidden="true">🔒</span>{t('landing.trustSecure')}</span>
        </div>
      </div>

      {/* RIGHT — auth card. The multi-vertical type picker now lives directly
          on the hero (three cards) instead of behind a "Create New" button →
          the user sees every supported vertical at a glance. Login + Join with
          Code become secondary text links so returning users + family members
          joining by code still reach their flow in one tap. */}
      <div className="auth-panel">
        <div className="auth-panel-head">
          <h2>{t('landing.panelTitle')}</h2>
          <p>{t('landing.panelSubtitle')}</p>
        </div>

        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Wedding — active */}
          <button
            type="button"
            onClick={() => onSelect('create')}
            id="btn-pick-wedding"
            className="surface-card"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--divider)', borderRadius: 'var(--radius-lg)' }}
          >
            <span aria-hidden="true" style={{ fontSize: '1.8rem', lineHeight: 1 }}>💒</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>{t('pickType.wedding.title')}</span>
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>{t('pickType.wedding.desc')}</span>
            </span>
            <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>→</span>
          </button>

          {/* Personal — active */}
          <button
            type="button"
            onClick={() => onSelect('create-personal')}
            id="btn-pick-personal"
            className="surface-card"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--divider)', borderRadius: 'var(--radius-lg)' }}
          >
            <span aria-hidden="true" style={{ fontSize: '1.8rem', lineHeight: 1 }}>💰</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>{t('pickType.personal.title')}</span>
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>{t('pickType.personal.desc')}</span>
            </span>
            <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>→</span>
          </button>

          {/* Trip — coming soon */}
          <div
            aria-disabled="true"
            className="surface-card"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textAlign: 'left', border: '1px solid var(--divider)', borderRadius: 'var(--radius-lg)', opacity: 0.55, cursor: 'not-allowed' }}
          >
            <span aria-hidden="true" style={{ fontSize: '1.8rem', lineHeight: 1 }}>✈️</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>{t('pickType.trip.title')}</span>
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>{t('pickType.trip.desc')}</span>
            </span>
            <span className="pill" style={{ fontSize: '0.66rem', fontWeight: 600, padding: '3px 8px', background: 'var(--surface-elevated)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('pickType.trip.soonBadge')}</span>
          </div>
        </div>

        <OrDivider />
        <GoogleAuthButton text="continue_with" onCredential={handleHeroGoogle} />

        {/* Secondary actions — small text links for the two non-create flows. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 16, fontSize: '0.83rem' }}>
          <button
            type="button"
            onClick={() => onSelect('login')}
            id="btn-link-login"
            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontWeight: 600, cursor: 'pointer', padding: '4px 6px' }}
          >
            {t('landing.signInLink')}
          </button>
          <button
            type="button"
            onClick={() => onSelect('join')}
            id="btn-link-join"
            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontWeight: 600, cursor: 'pointer', padding: '4px 6px' }}
          >
            {t('landing.joinCodeLink')}
          </button>
        </div>

        <p className="landing-hint">{t('landing.helperHint')}</p>
      </div>
    </div>
  );
}

function CreateForm({ onBack, login, navigate }: { onBack: () => void; login: LoginFn; navigate: NavigateFunction }) {
  const { t, tServer } = useLang();
  const [form, setForm] = useState({
    weddingName: '', partner1: '', partner2: '', weddingDate: '', totalBudget: '',
    adminName: '', adminRelation: '',
    email: '', password: '', confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Wedding + admin-name fields are required for BOTH local and Google signup.
  const validateWeddingFields = () => {
    if (!form.weddingName || !form.partner1 || !form.partner2 || !form.weddingDate || !form.adminName) {
      toast.error(t('create.errFillRequired'));
      return false;
    }
    return true;
  };

  const finishCreate = (res: { data: { data: AuthResult } }) => {
    const { wedding, member } = res.data.data;
    login(member, wedding);
    toast.success(t('create.successCode', { code: wedding.joinCode }));
    navigate('/dashboard');
  };

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!validateWeddingFields()) return;
    if (!form.email) return toast.error(t('create.errEmail'));
    if (!form.password) return toast.error(t('create.errPassword'));
    if (form.password.length < 8) return toast.error(t('create.errPasswordLength'));
    if (form.password !== form.confirmPassword) return toast.error(t('create.errPasswordMismatch'));
    if (isTurnstileEnabled() && !captcha) return toast.error(t('common.captchaRequired'));

    setLoading(true);
    try {
      const adminRelation = form.adminRelation || t('create.adminRelationDefault');
      const res = await createWedding({ ...form, adminRelation, totalBudget: parseFloat(form.totalBudget) || 0, turnstileToken: captcha });
      finishCreate(res);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('create.errFailed'));
    } finally { setLoading(false); }
  };

  // Create the wedding using a Google account instead of email + password.
  // Wedding details still come from the form; identity comes from Google.
  const handleGoogleSignup = async (credential: string) => {
    if (!validateWeddingFields()) return;
    if (isTurnstileEnabled() && !captcha) return toast.error(t('common.captchaRequired'));
    setLoading(true);
    try {
      const adminRelation = form.adminRelation || t('create.adminRelationDefault');
      const res = await createWedding({
        weddingName: form.weddingName,
        partner1: form.partner1,
        partner2: form.partner2,
        weddingDate: form.weddingDate,
        totalBudget: parseFloat(form.totalBudget) || 0,
        adminName: form.adminName,
        adminRelation,
        googleCredential: credential,
        turnstileToken: captcha,
      });
      finishCreate(res);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('login.errGoogleFailed'));
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-in" style={{ width: '100%' }}>
      <div className="page-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>{t('create.header')}</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('create.weddingName')}</label>
          <input className="form-input" placeholder={t('create.weddingNamePlaceholder')} value={form.weddingName} onChange={e => set('weddingName', e.target.value)} id="input-wedding-name" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">{t('create.partner1')}</label>
            <input className="form-input" placeholder={t('create.partnerPlaceholder')} value={form.partner1} onChange={e => set('partner1', e.target.value)} id="input-partner1" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('create.partner2')}</label>
            <input className="form-input" placeholder={t('create.partnerPlaceholder')} value={form.partner2} onChange={e => set('partner2', e.target.value)} id="input-partner2" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('create.weddingDate')}</label>
            <input className="form-input" type="date" value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)} id="input-wedding-date" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('create.totalBudget')}</label>
            <input className="form-input" type="number" inputMode="decimal" placeholder={t('create.budgetPlaceholder')} value={form.totalBudget} onChange={e => set('totalBudget', e.target.value)} id="input-budget" />
          </div>
        </div>

        <hr className="divider" />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', fontWeight: 600, marginBottom: 14 }}>{t('create.adminSection')}</p>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('create.yourName')}</label>
            <input className="form-input" placeholder={t('create.yourNamePlaceholder')} value={form.adminName} onChange={e => set('adminName', e.target.value)} id="input-admin-name" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('create.yourRelation')}</label>
            <input className="form-input" placeholder={t('create.yourRelationPlaceholder')} value={form.adminRelation} onChange={e => set('adminRelation', e.target.value)} id="input-admin-relation" />
          </div>
        </div>

        <hr className="divider" />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', fontWeight: 600, marginBottom: 4 }}>{t('create.credSection')}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 16, lineHeight: 1.5 }}>{t('create.credHint')}</p>

        <div className="form-group">
          <label className="form-label">{t('create.email')}</label>
          <input className="form-input" type="email" autoComplete="email" placeholder={t('create.emailPlaceholder')} value={form.email} onChange={e => set('email', e.target.value)} id="input-email" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('create.password')}</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('create.passwordPlaceholder')} value={form.password} onChange={e => set('password', e.target.value)} id="input-password" style={{ paddingRight: 50 }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: 4 }}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('create.confirmPassword')}</label>
            <input className="form-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('create.confirmPasswordPlaceholder')} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} id="input-confirm-password" />
            {form.password && form.confirmPassword && form.password !== form.confirmPassword && (
              <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 6 }}>{t('create.passwordsNoMatch')}</p>
            )}
            {form.password && form.confirmPassword && form.password === form.confirmPassword && (
              <p style={{ color: 'var(--success)', fontSize: '0.8rem', marginTop: 6 }}>{t('create.passwordsMatch')}</p>
            )}
          </div>
        </div>

        <TurnstileWidget onToken={setCaptcha} />
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-create" style={{ marginTop: 8 }}>
          <RollText>{loading ? t('create.creating') : t('create.submitBtn')}</RollText>
        </button>
      </form>

      <OrDivider />
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12, lineHeight: 1.5 }}>
        {t('create.googleHint')}
      </p>
      <GoogleAuthButton text="signup_with" onCredential={handleGoogleSignup} />
    </div>
  );
}

function LoginForm({ onBack, onSuccess, onForgot }: { onBack: () => void; onSuccess: AuthSuccessHandler; onForgot: () => void }) {
  const { t, tServer } = useLang();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error(t('login.errMissing'));
    if (isTurnstileEnabled() && !captcha) return toast.error(t('common.captchaRequired'));
    setLoading(true);
    try {
      const res = await loginUser({ ...form, turnstileToken: captcha });
      onSuccess(res.data.data);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('login.errFailed'));
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async (credential: string) => {
    try {
      const res = await googleLogin({ credential });
      onSuccess(res.data.data);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('login.errGoogleFailed'));
    }
  };

  return (
    <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div className="page-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>{t('login.header')}</h1>
      </div>
      <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24 }}>{t('login.subtitle')}</p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('login.email')}</label>
          <input className="form-input" type="email" autoComplete="email" placeholder={t('login.emailPlaceholder')} value={form.email} onChange={e => set('email', e.target.value)} id="input-login-email" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">{t('login.password')}</label>
          <div style={{ position: 'relative' }}>
            <input className="form-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder={t('login.passwordPlaceholder')} value={form.password} onChange={e => set('password', e.target.value)} id="input-login-password" style={{ paddingRight: 50 }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: 4 }}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <TurnstileWidget onToken={setCaptcha} />
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-login" style={{ marginTop: 8 }}>
          <RollText>{loading ? t('login.loggingIn') : t('login.submitBtn')}</RollText>
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button type="button" onClick={onForgot} id="btn-forgot-password" style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', padding: 4 }}>
          {t('login.forgotPassword')}
        </button>
      </div>

      <OrDivider />
      <GoogleAuthButton text="signin_with" onCredential={handleGoogleLogin} />
    </div>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { t, tServer } = useLang();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState('');

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error(t('forgot.errEmail'));
    if (isTurnstileEnabled() && !captcha) return toast.error(t('common.captchaRequired'));
    setLoading(true);
    try {
      await forgotPassword(email.trim(), captcha);
      setSent(true); // backend always returns a generic success (anti-enumeration)
    } catch (err) {
      // Only network/unexpected errors reach here.
      toast.error(tServer(err.response?.data?.message) || t('forgot.errFailed'));
    } finally { setLoading(false); }
  };

  if (sent) {
    return (
      <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📧</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>{t('forgot.sentTitle')}</h1>
        <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.6 }}>
          {t('forgot.sentBody')}
        </p>
        <button className="btn btn-secondary btn-full btn-lg" onClick={onBack}><RollText>{t('forgot.backToLogin')}</RollText></button>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div className="page-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>{t('forgot.header')}</h1>
      </div>
      <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24 }}>{t('forgot.subtitle')}</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('forgot.email')}</label>
          <input className="form-input" type="email" autoComplete="email" placeholder={t('login.emailPlaceholder')} value={email} onChange={e => setEmail(e.target.value)} id="input-forgot-email" autoFocus />
        </div>
        <TurnstileWidget onToken={setCaptcha} />
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-forgot" style={{ marginTop: 8 }}>
          <RollText>{loading ? t('forgot.sending') : t('forgot.submitBtn')}</RollText>
        </button>
      </form>
    </div>
  );
}

function SelectWeddingForm({ weddings, onSelect, onBack }: { weddings: WeddingOption[] | null; onSelect: (memberId: string) => void; onBack: () => void }) {
  const { t } = useLang();
  return (
    <div className="animate-in" style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
      <div className="page-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>{t('select.header')}</h1>
      </div>
      <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24 }}>
        {t('select.subtitle')}
      </p>
      <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {weddings && weddings.map(w => (
          <button
            key={w.memberId}
            onClick={() => onSelect(w.memberId)}
            className="surface-card"
            style={{
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 'var(--space-4) var(--space-5)',
              transition: 'var(--transition)',
            }}
          >
            <div style={{ fontSize: '1.8rem', flexShrink: 0 }}>💒</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.weddingName}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {w.role === 'admin' ? t('select.admin') : t('select.member')}
              </p>
            </div>
            <span style={{ color: 'var(--primary-light)', fontSize: '1.3rem', flexShrink: 0 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// identify (code + name) → the server decides: new member, returning (PIN),
// or reset (admin-issued code). The join code alone never opens an existing account.
type JoinStep = 'identify' | 'new' | 'returning' | 'reset';

function JoinForm({ onBack, login, navigate, onAuthSuccess, onSwitchToLogin }: { onBack: () => void; login: LoginFn; navigate: NavigateFunction; onAuthSuccess: AuthSuccessHandler; onSwitchToLogin: () => void }) {
  const { t, tServer } = useLang();
  const [step, setStep] = useState<JoinStep>('identify');
  const [weddingName, setWeddingName] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [form, setForm] = useState({ joinCode: '', name: '', relation: '', pin: '', confirmPin: '', resetCode: '' });
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const identity = () => ({ joinCode: form.joinCode.toUpperCase().trim(), name: form.name.trim() });

  const goTo = (next: JoinStep) => {
    setForm(p => ({ ...p, pin: '', confirmPin: '', resetCode: '' }));
    setStep(next);
  };

  const handleJoinError = (err: any, fallbackKey: string) => {
    const code = err.response?.data?.code;
    toast.error(pinErrorMessage(err, t, tServer, fallbackKey));
    if (code === 'USE_LOGIN') setTimeout(onSwitchToLogin, 1200);
    if (code === 'PIN_RESET_REQUIRED') goTo('reset');
  };

  const finish = (res: any) => {
    const { wedding, member } = res.data.data;
    login(member, wedding); // a pending member lands on the waiting screen
    if (member.status === 'pending') toast.success(t('pending.requestSent'));
    else toast.success(tServer(res.data.message) || t('login.welcomeBack'));
    navigate('/dashboard');
  };

  // Every submit shares the same loading/error handling.
  const run = async (fn: () => Promise<void>, fallbackKey: string) => {
    setLoading(true);
    try { await fn(); } catch (err) { handleJoinError(err, fallbackKey); } finally { setLoading(false); }
  };

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!form.joinCode.trim() || !form.name.trim()) return toast.error(t('join.errMissing'));

    if (step === 'identify') {
      return run(async () => {
        const { status, weddingName: name, requiresApproval } = (await lookupJoin(identity())).data.data;
        setWeddingName(name);
        setNeedsApproval(requiresApproval);
        if (status === 'use_login') {
          toast.error(t('join.errUseLogin'));
          setTimeout(onSwitchToLogin, 1200);
        } else {
          goTo(status === 'reset_required' ? 'reset' : status);
          if (status === 'reset_required') toast(t('pin.errResetRequired'), { icon: '🔐' });
        }
      }, 'join.errFailed');
    }

    const formError = pinFormError(form.pin, step === 'returning' ? null : form.confirmPin, t);
    if (formError) return toast.error(formError);

    if (step === 'reset') {
      if (!form.resetCode.trim()) return toast.error(t('pin.errResetCode'));
      return run(async () => finish(await resetPinWithCode({ ...identity(), resetCode: form.resetCode, pin: form.pin })), 'join.errFailed');
    }
    return run(async () => finish(await joinWedding({
      ...identity(),
      pin: form.pin,
      ...(step === 'new' && { relation: form.relation.trim() }),
    })), 'join.errFailed');
  };

  // Join the wedding using a Google account. The join code is still required;
  // the member's name/email come from Google. Existing users with this Google
  // email are logged in (and may be routed to the multi-wedding selector).
  const handleGoogleJoin = async (credential: string) => {
    if (!form.joinCode) return toast.error(t('join.errCodeNeeded'));
    setLoading(true);
    try {
      const res = await googleLogin({ credential, joinCode: form.joinCode.toUpperCase().trim() });
      onAuthSuccess(res.data.data);
    } catch (err) {
      handleJoinError(err, 'login.errGoogleFailed');
    } finally { setLoading(false); }
  };

  const name = form.name.trim();
  const header = {
    identify: t('join.header'),
    new: t('join.newHeader', { wedding: weddingName }),
    returning: t('join.returningHeader', { name }),
    reset: t('join.resetHeader'),
  }[step];
  const submitLabel = {
    identify: t('join.continue'),
    new: t('join.submitBtn'),
    returning: t('join.signInBtn'),
    reset: t('join.resetBtn'),
  }[step];
  const linkBtn = { background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, padding: 8 };

  return (
    <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div className="page-header">
        <button className="back-btn" onClick={step === 'identify' ? onBack : () => goTo('identify')} aria-label="Back">←</button>
        <h1>{header}</h1>
      </div>
      <form onSubmit={handleSubmit} key={step}>
        {step === 'identify' && (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="input-join-code">{t('join.code')}</label>
              <input
                className="form-input form-input-lg text-tnum"
                placeholder={t('join.codePlaceholder')}
                maxLength={6}
                value={form.joinCode}
                onChange={e => set('joinCode', e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase', letterSpacing: '6px' }}
                id="input-join-code"
                autoComplete="off"
                autoFocus
              />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8, textAlign: 'center' }}>{t('join.codeHint')}</p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="input-join-name">{t('join.name')}</label>
              <input className="form-input" placeholder={t('join.namePlaceholder')} value={form.name} onChange={e => set('name', e.target.value)} id="input-join-name" autoComplete="username" maxLength={50} />
            </div>
          </>
        )}

        {step === 'new' && (
          <>
            {needsApproval && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.5 }}>🛡️ {t('pending.joinHint')}</p>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="input-join-relation">{t('join.relation')}</label>
              <input className="form-input" placeholder={t('join.relationPlaceholder')} value={form.relation} onChange={e => set('relation', e.target.value)} id="input-join-relation" maxLength={50} autoFocus />
            </div>
            <PinField id="input-join-pin" label={t('pin.create')} value={form.pin} onChange={v => set('pin', v)} autoComplete="new-password" hint={t('pin.createHint')} />
            <PinField id="input-join-pin-confirm" label={t('pin.confirm')} value={form.confirmPin} onChange={v => set('confirmPin', v)} autoComplete="new-password" />
          </>
        )}

        {step === 'returning' && (
          <PinField id="input-join-pin" label={t('pin.enter')} value={form.pin} onChange={v => set('pin', v)} autoComplete="current-password" hint={t('join.returningHint')} autoFocus />
        )}

        {step === 'reset' && (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.5 }}>{t('join.resetHint')}</p>
            <div className="form-group">
              <label className="form-label" htmlFor="input-join-reset-code">{t('join.resetCode')}</label>
              <input
                className="form-input form-input-lg text-tnum"
                placeholder={t('join.resetCodePlaceholder')}
                maxLength={9}
                value={form.resetCode}
                onChange={e => set('resetCode', e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center' }}
                id="input-join-reset-code"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <PinField id="input-join-pin" label={t('pin.new')} value={form.pin} onChange={v => set('pin', v)} autoComplete="new-password" hint={t('pin.createHint')} />
            <PinField id="input-join-pin-confirm" label={t('pin.confirm')} value={form.confirmPin} onChange={v => set('confirmPin', v)} autoComplete="new-password" />
          </>
        )}

        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-join" style={{ marginTop: 8 }}>
          <RollText>{loading ? t('join.checking') : submitLabel}</RollText>
        </button>
      </form>

      {step === 'returning' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" style={linkBtn} onClick={() => goTo('reset')}>{t('join.forgotPin')}</button>
          <button type="button" style={linkBtn} onClick={() => goTo('identify')}>{t('join.notYou', { name })}</button>
        </div>
      )}

      {step === 'identify' && (
        <>
          <OrDivider />
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12, lineHeight: 1.5 }}>
            {t('join.googleHint')}
          </p>
          <GoogleAuthButton text="continue_with" onCredential={handleGoogleJoin} />
        </>
      )}
    </div>
  );
}

/**
 * Personal-vertical create form (Phase 2, 2026-05-27). Simpler than the
 * wedding-create form — just workspace name (optional), monthly budget
 * (optional), the owner's name, and email+password OR Google. Backend
 * auto-creates the lone owner member, so there's no admin-relation field and
 * no join code to share.
 */
function CreatePersonalForm({ onBack, login, navigate }: { onBack: () => void; login: LoginFn; navigate: NavigateFunction }) {
  const { t, tServer } = useLang();
  const [form, setForm] = useState({
    name: '', monthlyBudget: '',
    adminName: '',
    email: '', password: '', confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const finishCreate = (res: { data: { data: AuthResult } }) => {
    const { wedding, member } = res.data.data;
    login(member, wedding);
    toast.success(t('createPersonal.successCreated'));
    navigate('/dashboard');
  };

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!form.adminName.trim()) return toast.error(t('createPersonal.errName'));
    if (!form.email) return toast.error(t('create.errEmail'));
    if (!form.password) return toast.error(t('create.errPassword'));
    if (form.password.length < 8) return toast.error(t('create.errPasswordLength'));
    if (form.password !== form.confirmPassword) return toast.error(t('create.errPasswordMismatch'));
    if (isTurnstileEnabled() && !captcha) return toast.error(t('common.captchaRequired'));

    setLoading(true);
    try {
      const res = await createPersonalWorkspace({
        name: form.name,
        monthlyBudget: parseFloat(form.monthlyBudget) || 0,
        adminName: form.adminName,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirmPassword,
        turnstileToken: captcha,
      });
      finishCreate(res);
    } catch (err: any) {
      toast.error(tServer(err.response?.data?.message) || t('createPersonal.errFailed'));
    } finally { setLoading(false); }
  };

  const handleGoogleSignup = async (credential: string) => {
    if (!form.adminName.trim()) return toast.error(t('createPersonal.errName'));
    if (isTurnstileEnabled() && !captcha) return toast.error(t('common.captchaRequired'));
    setLoading(true);
    try {
      const res = await createPersonalWorkspace({
        name: form.name,
        monthlyBudget: parseFloat(form.monthlyBudget) || 0,
        adminName: form.adminName,
        googleCredential: credential,
        turnstileToken: captcha,
      });
      finishCreate(res);
    } catch (err: any) {
      toast.error(tServer(err.response?.data?.message) || t('login.errGoogleFailed'));
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-in" style={{ width: '100%' }}>
      <div className="page-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>{t('createPersonal.header')}</h1>
      </div>
      <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 20 }}>{t('createPersonal.subtitle')}</p>

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('createPersonal.workspaceName')}</label>
            <input className="form-input" placeholder={t('createPersonal.workspaceNamePlaceholder')} value={form.name} onChange={e => set('name', e.target.value)} id="input-personal-name" />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 4 }}>{t('createPersonal.workspaceNameHint')}</p>
          </div>
          <div className="form-group">
            <label className="form-label">{t('createPersonal.monthlyBudget')}</label>
            <input className="form-input" type="number" inputMode="decimal" placeholder={t('createPersonal.monthlyBudgetPlaceholder')} value={form.monthlyBudget} onChange={e => set('monthlyBudget', e.target.value)} id="input-personal-budget" />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 4 }}>{t('createPersonal.monthlyBudgetHint')}</p>
          </div>
        </div>

        <hr className="divider" />

        <div className="form-group">
          <label className="form-label">{t('create.yourName')}</label>
          <input className="form-input" placeholder={t('create.yourNamePlaceholder')} value={form.adminName} onChange={e => set('adminName', e.target.value)} id="input-personal-admin-name" />
        </div>

        <hr className="divider" />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', fontWeight: 600, marginBottom: 4 }}>{t('create.credSection')}</p>

        <div className="form-group">
          <label className="form-label">{t('create.email')}</label>
          <input className="form-input" type="email" autoComplete="email" placeholder={t('create.emailPlaceholder')} value={form.email} onChange={e => set('email', e.target.value)} id="input-personal-email" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('create.password')}</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('create.passwordPlaceholder')} value={form.password} onChange={e => set('password', e.target.value)} id="input-personal-password" style={{ paddingRight: 50 }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: 4 }}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('create.confirmPassword')}</label>
            <input className="form-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('create.confirmPasswordPlaceholder')} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} id="input-personal-confirm-password" />
            {form.password && form.confirmPassword && form.password !== form.confirmPassword && (
              <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 6 }}>{t('create.passwordsNoMatch')}</p>
            )}
            {form.password && form.confirmPassword && form.password === form.confirmPassword && (
              <p style={{ color: 'var(--success)', fontSize: '0.8rem', marginTop: 6 }}>{t('create.passwordsMatch')}</p>
            )}
          </div>
        </div>

        <TurnstileWidget onToken={setCaptcha} />
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-personal-create" style={{ marginTop: 8 }}>
          <RollText>{loading ? t('createPersonal.creating') : t('createPersonal.submitBtn')}</RollText>
        </button>
      </form>

      <OrDivider />
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12, lineHeight: 1.5 }}>
        {t('createPersonal.googleHint')}
      </p>
      <GoogleAuthButton text="signup_with" onCredential={handleGoogleSignup} />
    </div>
  );
}
