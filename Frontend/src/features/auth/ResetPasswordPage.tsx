import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useLang } from '@/context/LanguageContext';
import { resetPassword } from '@/api';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import RollText from '@/components/RollText';

export default function ResetPasswordPage() {
  const { t, tServer } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 8) return toast.error(t('reset.errLength'));
    if (password !== confirm) return toast.error(t('reset.errMismatch'));
    setLoading(true);
    try {
      const res = await resetPassword(token, password);
      toast.success(tServer(res.data.message) || t('reset.successToast'));
      navigate('/');
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('reset.errFailed'));
    } finally { setLoading(false); }
  };

  const wrapper = (children) => (
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

  if (!token) {
    return wrapper(
      <div className="animate-in" style={{ width: '100%', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>⚠️</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>{t('reset.invalidTitle')}</h1>
        <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.6 }}>{t('reset.invalidBody')}</p>
        <button className="btn btn-primary btn-full btn-lg" onClick={() => navigate('/')}><RollText>{t('reset.goToLogin')}</RollText></button>
      </div>
    );
  }

  return wrapper(
    <div className="animate-in form-card" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 'var(--space-3)' }}>{t('reset.header')}</h1>
      <p className="text-muted" style={{ fontSize: '0.92rem', marginBottom: 24 }}>{t('reset.subtitle')}</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('reset.newPassword')}</label>
          <div style={{ position: 'relative' }}>
            <input className="form-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('create.passwordPlaceholder')} value={password} onChange={e => setPassword(e.target.value)} id="input-reset-password" style={{ paddingRight: 50 }} autoFocus />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: 4 }}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t('reset.confirmPassword')}</label>
          <input className="form-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={t('create.confirmPasswordPlaceholder')} value={confirm} onChange={e => setConfirm(e.target.value)} id="input-reset-confirm" />
          {password && confirm && password !== confirm && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 6 }}>{t('create.passwordsNoMatch')}</p>
          )}
          {password && confirm && password === confirm && (
            <p style={{ color: 'var(--success)', fontSize: '0.8rem', marginTop: 6 }}>{t('create.passwordsMatch')}</p>
          )}
        </div>
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-reset" style={{ marginTop: 8 }}>
          <RollText>{loading ? t('reset.resetting') : t('reset.submitBtn')}</RollText>
        </button>
      </form>
    </div>
  );
}
