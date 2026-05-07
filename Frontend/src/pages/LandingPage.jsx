import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { createWedding, joinWedding, loginUser, googleLogin, selectWedding } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

export default function LandingPage() {
  const [mode, setMode] = useState(null); // null | 'create' | 'join' | 'login' | 'select-wedding'
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
      {!mode && <HeroSection onSelect={setMode} />}
      {mode === 'create' && <CreateForm onBack={() => setMode(null)} login={login} navigate={navigate} />}
      {mode === 'join' && <JoinForm onBack={() => setMode(null)} login={login} navigate={navigate} />}
      {mode === 'login' && <LoginForm onBack={() => setMode(null)} onSuccess={handleLoginSuccess} />}
      {mode === 'select-wedding' && <SelectWeddingForm weddings={weddingList} onSelect={handleSelectWedding} onBack={() => setMode('login')} />}
    </div>
  );
}

function HeroSection({ onSelect }) {
  const { t } = useLang();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.weddingName || !form.partner1 || !form.partner2 || !form.weddingDate || !form.adminName) {
      return toast.error(t('create.errFillRequired'));
    }
    if (!form.email) return toast.error(t('create.errEmail'));
    if (!form.password) return toast.error(t('create.errPassword'));
    if (form.password.length < 6) return toast.error(t('create.errPasswordLength'));
    if (form.password !== form.confirmPassword) return toast.error(t('create.errPasswordMismatch'));

    setLoading(true);
    try {
      const adminRelation = form.adminRelation || t('create.adminRelationDefault');
      const res = await createWedding({ ...form, adminRelation, totalBudget: parseFloat(form.totalBudget) || 0 });
      const { wedding, member, token } = res.data.data;
      login(member, wedding, token);
      toast.success(t('create.successCode', { code: wedding.joinCode }));
      navigate('/dashboard');
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('create.errFailed'));
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
    </div>
  );
}

function LoginForm({ onBack, onSuccess }) {
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

  const handleGoogleLogin = useCallback(async (response) => {
    try {
      const res = await googleLogin({ credential: response.credential });
      onSuccess(res.data.data);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('login.errGoogleFailed'));
    }
  }, [onSuccess, t, tServer]);

  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId || typeof window.google === 'undefined') return;

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleLogin
    });

    window.google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      {
        theme: 'filled_black',
        size: 'large',
        width: '100%',
        shape: 'pill',
        text: 'signin_with',
        logo_alignment: 'center'
      }
    );
  }, [handleGoogleLogin]);

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 16px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>{t('common.or')}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
      </div>
      <div id="google-signin-btn" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, minHeight: 44 }} />

      {typeof window !== 'undefined' && typeof window.google === 'undefined' && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          {t('login.googleConfigHint')}
        </p>
      )}
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

function JoinForm({ onBack, login, navigate }) {
  const { t, tServer } = useLang();
  const [form, setForm] = useState({ joinCode: '', name: '', relation: '' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
      toast.error(tServer(err.response?.data?.message) || t('join.errFailed'));
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
    </div>
  );
}
