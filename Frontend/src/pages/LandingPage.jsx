import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { createWedding, joinWedding, loginUser, googleLogin, selectWedding, forgotPassword } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

// Reusable Google Identity Services button. Renders Google's official button and
// forwards the verified credential to onCredential. Only one is mounted at a time
// (the page shows one form at a time), so the global initialize() call is safe.
//
// The GSI script in index.html is `async defer`, so window.google may not exist
// yet when this mounts. We poll until it is ready (with cleanup + timeout) instead
// of giving up on the first try — otherwise the button silently never appears.
function GoogleAuthButton({ onCredential, text = 'continue_with' }) {
  const { t } = useLang();
  const containerRef = useRef(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'unavailable'

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) { setStatus('unavailable'); return; }

    let cancelled = false;
    let timer;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // ~6s at 100ms intervals

    const render = () => {
      if (cancelled || !containerRef.current) return;
      const gsi = window.google?.accounts?.id;
      if (gsi) {
        gsi.initialize({
          client_id: clientId,
          callback: (response) => cbRef.current(response.credential),
        });
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
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) { setStatus('unavailable'); return; }
      timer = setTimeout(render, 100);
    };

    render();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [text]);

  return (
    <div>
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
      {status === 'loading' && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 8 }}>
          {t('login.googleLoading')}
        </p>
      )}
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
  const [mode, setMode] = useState(null); // null | 'create' | 'join' | 'login' | 'select-wedding' | 'forgot'
  const { login } = useWedding();
  const { t, tServer } = useLang();
  const navigate = useNavigate();

  const [weddingList, setWeddingList] = useState(null);

  const handleLoginSuccess = (data) => {
    if (data.multipleWeddings) {
      setWeddingList(data.weddings);
      setMode('select-wedding');
    } else {
      login(data.member, data.wedding, data.token);
      toast.success(tServer(data.message) || t('login.welcomeBack'));
      navigate('/dashboard');
    }
  };

  const handleSelectWedding = async (memberId) => {
    try {
      const res = await selectWedding({ memberId });
      const { wedding, member, token } = res.data.data;
      login(member, wedding, token);
      toast.success(t('select.entered', { name: wedding.weddingName }));
      navigate('/dashboard');
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('select.errFailed'));
    }
  };

  return (
    <div className="container" style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      paddingTop: 32,
      paddingBottom: 32,
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 8, zIndex: 10 }}>
        <LanguageToggle />
        <ThemeToggle />
      </div>
      {!mode && <HeroSection onSelect={setMode} onGoogleSuccess={handleLoginSuccess} />}
      {mode === 'create' && <CreateForm onBack={() => setMode(null)} login={login} navigate={navigate} />}
      {mode === 'join' && <JoinForm onBack={() => setMode(null)} login={login} navigate={navigate} onAuthSuccess={handleLoginSuccess} onSwitchToLogin={() => setMode('login')} />}
      {mode === 'login' && <LoginForm onBack={() => setMode(null)} onSuccess={handleLoginSuccess} onForgot={() => setMode('forgot')} />}
      {mode === 'forgot' && <ForgotPasswordForm onBack={() => setMode('login')} />}
      {mode === 'select-wedding' && <SelectWeddingForm weddings={weddingList} onSelect={handleSelectWedding} onBack={() => setMode('login')} />}
    </div>
  );
}

function HeroSection({ onSelect, onGoogleSuccess }) {
  const { t, tServer } = useLang();

  // Returning members: one tap to sign in. New users (no account yet) get a
  // friendly nudge to create a wedding or join with a code.
  const handleHeroGoogle = async (credential) => {
    try {
      const res = await googleLogin({ credential });
      onGoogleSuccess(res.data.data);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('login.errGoogleFailed'));
    }
  };

  return (
    <div className="animate-in" style={{ textAlign: 'center', maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <div style={{
        fontSize: 'clamp(3.4rem, 10vw, 4.4rem)',
        marginBottom: 'var(--space-4)',
        animation: 'bob 4s ease-in-out infinite',
        display: 'inline-block',
      }}>💒</div>
      <h1 className="h1" style={{ marginBottom: 'var(--space-3)' }}>
        {t('landing.title1')}<br />
        <span style={{
          background: 'var(--gradient-primary)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          {t('landing.title2')}
        </span>
      </h1>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '1rem',
        marginBottom: 'var(--space-10)',
        lineHeight: 1.6,
      }}>
        {t('landing.subtitle1')}<br />{t('landing.subtitle2')}
      </p>
      <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="btn btn-primary btn-full btn-lg" onClick={() => onSelect('create')} id="btn-create-wedding">
          {t('landing.createBtn')}
        </button>
        <button className="btn btn-secondary btn-full btn-lg" onClick={() => onSelect('join')} id="btn-join-wedding">
          {t('landing.joinBtn')}
        </button>
        <button className="btn btn-ghost btn-full btn-lg" onClick={() => onSelect('login')} id="btn-login">
          {t('landing.loginBtn')}
        </button>
      </div>

      <div style={{ maxWidth: 360, margin: '0 auto' }}>
        <OrDivider />
        <GoogleAuthButton text="continue_with" onCredential={handleHeroGoogle} />
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 'var(--space-6)', lineHeight: 1.6 }}>
        {t('landing.helperHint')}
      </p>
    </div>
  );
}

function CreateForm({ onBack, login, navigate }) {
  const { t, tServer } = useLang();
  const [form, setForm] = useState({
    weddingName: '', partner1: '', partner2: '', weddingDate: '', totalBudget: '',
    adminName: '', adminRelation: '',
    email: '', password: '', confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Wedding + admin-name fields are required for BOTH local and Google signup.
  const validateWeddingFields = () => {
    if (!form.weddingName || !form.partner1 || !form.partner2 || !form.weddingDate || !form.adminName) {
      toast.error(t('create.errFillRequired'));
      return false;
    }
    return true;
  };

  const finishCreate = (res) => {
    const { wedding, member, token } = res.data.data;
    login(member, wedding, token);
    toast.success(t('create.successCode', { code: wedding.joinCode }));
    navigate('/dashboard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateWeddingFields()) return;
    if (!form.email) return toast.error(t('create.errEmail'));
    if (!form.password) return toast.error(t('create.errPassword'));
    if (form.password.length < 6) return toast.error(t('create.errPasswordLength'));
    if (form.password !== form.confirmPassword) return toast.error(t('create.errPasswordMismatch'));

    setLoading(true);
    try {
      const adminRelation = form.adminRelation || t('create.adminRelationDefault');
      const res = await createWedding({ ...form, adminRelation, totalBudget: parseFloat(form.totalBudget) || 0 });
      finishCreate(res);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('create.errFailed'));
    } finally { setLoading(false); }
  };

  // Create the wedding using a Google account instead of email + password.
  // Wedding details still come from the form; identity comes from Google.
  const handleGoogleSignup = async (credential) => {
    if (!validateWeddingFields()) return;
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">{t('create.partner1')}</label>
            <input className="form-input" placeholder={t('create.partnerPlaceholder')} value={form.partner1} onChange={e => set('partner1', e.target.value)} id="input-partner1" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('create.partner2')}</label>
            <input className="form-input" placeholder={t('create.partnerPlaceholder')} value={form.partner2} onChange={e => set('partner2', e.target.value)} id="input-partner2" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t('create.weddingDate')}</label>
          <input className="form-input" type="date" value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)} id="input-wedding-date" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('create.totalBudget')}</label>
          <input className="form-input" type="number" inputMode="decimal" placeholder={t('create.budgetPlaceholder')} value={form.totalBudget} onChange={e => set('totalBudget', e.target.value)} id="input-budget" />
        </div>

        <hr className="divider" />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', fontWeight: 600, marginBottom: 14 }}>{t('create.adminSection')}</p>

        <div className="form-group">
          <label className="form-label">{t('create.yourName')}</label>
          <input className="form-input" placeholder={t('create.yourNamePlaceholder')} value={form.adminName} onChange={e => set('adminName', e.target.value)} id="input-admin-name" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('create.yourRelation')}</label>
          <input className="form-input" placeholder={t('create.yourRelationPlaceholder')} value={form.adminRelation} onChange={e => set('adminRelation', e.target.value)} id="input-admin-relation" />
        </div>

        <hr className="divider" />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', fontWeight: 600, marginBottom: 4 }}>{t('create.credSection')}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 16, lineHeight: 1.5 }}>{t('create.credHint')}</p>

        <div className="form-group">
          <label className="form-label">{t('create.email')}</label>
          <input className="form-input" type="email" autoComplete="email" placeholder={t('create.emailPlaceholder')} value={form.email} onChange={e => set('email', e.target.value)} id="input-email" />
        </div>
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

        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-create" style={{ marginTop: 8 }}>
          {loading ? t('create.creating') : t('create.submitBtn')}
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

function LoginForm({ onBack, onSuccess, onForgot }) {
  const { t, tServer } = useLang();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error(t('login.errMissing'));
    setLoading(true);
    try {
      const res = await loginUser(form);
      onSuccess(res.data.data);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('login.errFailed'));
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async (credential) => {
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
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-login" style={{ marginTop: 8 }}>
          {loading ? t('login.loggingIn') : t('login.submitBtn')}
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

function ForgotPasswordForm({ onBack }) {
  const { t, tServer } = useLang();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error(t('forgot.errEmail'));
    setLoading(true);
    try {
      await forgotPassword(email.trim());
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
        <button className="btn btn-secondary btn-full btn-lg" onClick={onBack}>{t('forgot.backToLogin')}</button>
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
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-forgot" style={{ marginTop: 8 }}>
          {loading ? t('forgot.sending') : t('forgot.submitBtn')}
        </button>
      </form>
    </div>
  );
}

function SelectWeddingForm({ weddings, onSelect, onBack }) {
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
                {w.role === 'admin' ? t('select.admin') : t('select.member')} • {t('select.codeLabel')} <span className="text-tnum">{w.joinCode}</span>
              </p>
            </div>
            <span style={{ color: 'var(--primary-light)', fontSize: '1.3rem', flexShrink: 0 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function JoinForm({ onBack, login, navigate, onAuthSuccess, onSwitchToLogin }) {
  const { t, tServer } = useLang();
  const [form, setForm] = useState({ joinCode: '', name: '', relation: '' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // A credentialed account (admin / has a password or Google) can't re-enter by
  // name — the backend returns 409. Guide them to Login instead of just erroring.
  const handleJoinError = (err, fallbackKey) => {
    const msg = tServer(err.response?.data?.message) || t(fallbackKey);
    toast.error(msg);
    if (err.response?.status === 409 && onSwitchToLogin) {
      setTimeout(() => onSwitchToLogin(), 1200);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.joinCode || !form.name) return toast.error(t('join.errMissing'));
    setLoading(true);
    try {
      const res = await joinWedding(form);
      const { wedding, member, token } = res.data.data;
      login(member, wedding, token);
      toast.success(tServer(res.data.message) || t('login.welcomeBack'));
      navigate('/dashboard');
    } catch (err) {
      handleJoinError(err, 'join.errFailed');
    } finally { setLoading(false); }
  };

  // Join the wedding using a Google account. The join code is still required;
  // the member's name/email come from Google. Existing users with this Google
  // email are logged in (and may be routed to the multi-wedding selector).
  const handleGoogleJoin = async (credential) => {
    if (!form.joinCode) return toast.error(t('join.errCodeNeeded'));
    setLoading(true);
    try {
      const res = await googleLogin({ credential, joinCode: form.joinCode.toUpperCase().trim() });
      onAuthSuccess(res.data.data);
    } catch (err) {
      handleJoinError(err, 'login.errGoogleFailed');
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div className="page-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>{t('join.header')}</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('join.code')}</label>
          <input
            className="form-input form-input-lg text-tnum"
            placeholder={t('join.codePlaceholder')}
            maxLength={6}
            value={form.joinCode}
            onChange={e => set('joinCode', e.target.value.toUpperCase())}
            style={{ textTransform: 'uppercase', letterSpacing: '6px' }}
            id="input-join-code"
            autoFocus
          />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8, textAlign: 'center' }}>{t('join.codeHint')}</p>
        </div>
        <div className="form-group">
          <label className="form-label">{t('join.name')}</label>
          <input className="form-input" placeholder={t('join.namePlaceholder')} value={form.name} onChange={e => set('name', e.target.value)} id="input-join-name" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('join.relation')}</label>
          <input className="form-input" placeholder={t('join.relationPlaceholder')} value={form.relation} onChange={e => set('relation', e.target.value)} id="input-join-relation" />
        </div>
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-join" style={{ marginTop: 8 }}>
          {loading ? t('join.joining') : t('join.submitBtn')}
        </button>
      </form>

      <OrDivider />
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12, lineHeight: 1.5 }}>
        {t('join.googleHint')}
      </p>
      <GoogleAuthButton text="continue_with" onCredential={handleGoogleJoin} />
    </div>
  );
}
