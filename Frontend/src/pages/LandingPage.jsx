import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { createWedding, joinWedding, loginUser, googleLogin, selectWedding } from '../api';

export default function LandingPage() {
  const [mode, setMode] = useState(null); // null | 'create' | 'join' | 'login'
  const { login } = useWedding();
  const navigate = useNavigate();

  // Handle multi-wedding selection flow
  const [weddingList, setWeddingList] = useState(null);

  const handleLoginSuccess = (data) => {
    if (data.multipleWeddings) {
      setWeddingList(data.weddings);
      setMode('select-wedding');
    } else {
      login(data.member, data.wedding, data.token);
      toast.success(data.message || `Welcome back!`);
      navigate('/dashboard');
    }
  };

  const handleSelectWedding = async (memberId) => {
    try {
      const res = await selectWedding({ memberId });
      const { wedding, member, token } = res.data.data;
      login(member, wedding, token);
      toast.success(`Entered ${wedding.weddingName}`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to select wedding');
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 40, paddingBottom: 40 }}>
      {!mode && <HeroSection onSelect={setMode} />}
      {mode === 'create' && <CreateForm onBack={() => setMode(null)} login={login} navigate={navigate} />}
      {mode === 'join' && <JoinForm onBack={() => setMode(null)} login={login} navigate={navigate} />}
      {mode === 'login' && <LoginForm onBack={() => setMode(null)} onSuccess={handleLoginSuccess} />}
      {mode === 'select-wedding' && <SelectWeddingForm weddings={weddingList} onSelect={handleSelectWedding} onBack={() => setMode('login')} />}
    </div>
  );
}

function HeroSection({ onSelect }) {
  return (
    <div className="animate-in" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: 16 }}>💒</div>
      <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 8, lineHeight: 1.2 }}>
        Wedding<br /><span style={{ color: 'var(--primary-light)' }}>Expense Tracker</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: 40, lineHeight: 1.6 }}>
        Track every rupee, together as a family. <br />Simple enough for everyone.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button className="btn btn-primary btn-full btn-lg" onClick={() => onSelect('create')} id="btn-create-wedding">
          💍 Create a Wedding
        </button>
        <button className="btn btn-secondary btn-full btn-lg" onClick={() => onSelect('join')} id="btn-join-wedding">
          🎉 Join with Code
        </button>
        <button className="btn btn-secondary btn-full btn-lg" onClick={() => onSelect('login')} id="btn-login" style={{ borderColor: 'var(--primary)', color: 'var(--primary-light)' }}>
          🔑 Login (Returning User)
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 24 }}>
        Family members join with code • Admins login with email
      </p>
    </div>
  );
}

function CreateForm({ onBack, login, navigate }) {
  const [form, setForm] = useState({
    weddingName: '', partner1: '', partner2: '', weddingDate: '', totalBudget: '',
    adminName: '', adminRelation: 'Organizer',
    email: '', password: '', confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.weddingName || !form.partner1 || !form.partner2 || !form.weddingDate || !form.adminName) {
      return toast.error('Please fill all required fields');
    }
    if (!form.email) return toast.error('Please provide your email');
    if (!form.password) return toast.error('Please create a password');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      const res = await createWedding({ ...form, totalBudget: parseFloat(form.totalBudget) || 0 });
      const { wedding, member, token } = res.data.data;
      login(member, wedding, token);
      toast.success(`Wedding created! Code: ${wedding.joinCode}`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create wedding');
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h1>Create Wedding</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Wedding Name *</label>
          <input className="form-input" placeholder="e.g., Rohan weds Neha" value={form.weddingName} onChange={e => set('weddingName', e.target.value)} id="input-wedding-name" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Partner 1 *</label>
            <input className="form-input" placeholder="Name" value={form.partner1} onChange={e => set('partner1', e.target.value)} id="input-partner1" />
          </div>
          <div className="form-group">
            <label className="form-label">Partner 2 *</label>
            <input className="form-input" placeholder="Name" value={form.partner2} onChange={e => set('partner2', e.target.value)} id="input-partner2" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Wedding Date *</label>
          <input className="form-input" type="date" value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)} id="input-wedding-date" />
        </div>
        <div className="form-group">
          <label className="form-label">Total Budget (₹)</label>
          <input className="form-input" type="number" placeholder="e.g., 500000" value={form.totalBudget} onChange={e => set('totalBudget', e.target.value)} id="input-budget" />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>👤 Your Account (as admin)</p>

        <div className="form-group">
          <label className="form-label">Your Name *</label>
          <input className="form-input" placeholder="Your name" value={form.adminName} onChange={e => set('adminName', e.target.value)} id="input-admin-name" />
        </div>
        <div className="form-group">
          <label className="form-label">Your Relation</label>
          <input className="form-input" placeholder="e.g., Father of Bride" value={form.adminRelation} onChange={e => set('adminRelation', e.target.value)} id="input-admin-relation" />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 4 }}>🔒 Login Credentials</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 16 }}>This allows you to log back in anytime, even if removed</p>

        <div className="form-group">
          <label className="form-label">Email Address *</label>
          <input className="form-input" type="email" placeholder="your@email.com" value={form.email} onChange={e => set('email', e.target.value)} id="input-email" />
        </div>
        <div className="form-group">
          <label className="form-label">Create Password *</label>
          <div style={{ position: 'relative' }}>
            <input className="form-input" type={showPassword ? 'text' : 'password'} placeholder="Min 6 characters" value={form.password} onChange={e => set('password', e.target.value)} id="input-password" style={{ paddingRight: 50 }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Confirm Password *</label>
          <input className="form-input" type={showPassword ? 'text' : 'password'} placeholder="Re-enter password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} id="input-confirm-password" />
          {form.password && form.confirmPassword && form.password !== form.confirmPassword && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 6 }}>❌ Passwords do not match</p>
          )}
          {form.password && form.confirmPassword && form.password === form.confirmPassword && (
            <p style={{ color: 'var(--success)', fontSize: '0.8rem', marginTop: 6 }}>✅ Passwords match</p>
          )}
        </div>

        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-create" style={{ marginTop: 8 }}>
          {loading ? '⏳ Creating...' : '🎉 Create Wedding'}
        </button>
      </form>
    </div>
  );
}

function LoginForm({ onBack, onSuccess }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Please enter email and password');
    setLoading(true);
    try {
      const res = await loginUser(form);
      onSuccess(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  // Google Sign-In handler
  const handleGoogleLogin = useCallback(async (response) => {
    try {
      const res = await googleLogin({ credential: response.credential });
      onSuccess(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Google login failed');
    }
  }, [onSuccess]);

  // Initialize Google Sign-In
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
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h1>Welcome Back</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>Login with your registered email</p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input className="form-input" type="email" placeholder="your@email.com" value={form.email} onChange={e => set('email', e.target.value)} id="input-login-email" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <div style={{ position: 'relative' }}>
            <input className="form-input" type={showPassword ? 'text' : 'password'} placeholder="Your password" value={form.password} onChange={e => set('password', e.target.value)} id="input-login-password" style={{ paddingRight: 50 }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-login" style={{ marginTop: 8 }}>
          {loading ? '⏳ Logging in...' : '🔑 Login'}
        </button>
      </form>

      {/* Google Sign-In */}
      <div style={{ textAlign: 'center', margin: '24px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
        </div>
      </div>
      <div id="google-signin-btn" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }} />

      {/* If Google SDK not loaded, show a styled fallback button */}
      {typeof window !== 'undefined' && typeof window.google === 'undefined' && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 8 }}>
          Google Sign-In requires a Google Client ID configuration
        </p>
      )}
    </div>
  );
}

function SelectWeddingForm({ weddings, onSelect, onBack }) {
  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h1>Select Wedding</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
        Your email is linked to multiple weddings. Tap one to enter.
      </p>
      {weddings && weddings.map(w => (
        <button
          key={w.memberId}
          className="glass-card"
          onClick={() => onSelect(w.memberId)}
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16, border: '1px solid var(--border-color)' }}
        >
          <div style={{ fontSize: '2rem' }}>💒</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4 }}>{w.weddingName}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {w.role === 'admin' ? '👑 Admin' : '👤 Member'} • Code: {w.joinCode}
            </p>
          </div>
          <span style={{ color: 'var(--primary-light)', fontSize: '1.2rem' }}>→</span>
        </button>
      ))}
    </div>
  );
}

function JoinForm({ onBack, login, navigate }) {
  const [form, setForm] = useState({ joinCode: '', name: '', relation: '' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.joinCode || !form.name) return toast.error('Please enter the code and your name');
    setLoading(true);
    try {
      const res = await joinWedding(form);
      const { wedding, member, token } = res.data.data;
      login(member, wedding, token);
      toast.success(res.data.message);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code or error joining');
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h1>Join a Wedding</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Wedding Code *</label>
          <input className="form-input form-input-lg" placeholder="ABC123" maxLength={6} value={form.joinCode} onChange={e => set('joinCode', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase', letterSpacing: '6px' }} id="input-join-code" />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8, textAlign: 'center' }}>Ask the wedding organizer for this code</p>
        </div>
        <div className="form-group">
          <label className="form-label">Your Name *</label>
          <input className="form-input" placeholder="e.g., Uncle Rajesh" value={form.name} onChange={e => set('name', e.target.value)} id="input-join-name" />
        </div>
        <div className="form-group">
          <label className="form-label">Your Relation</label>
          <input className="form-input" placeholder="e.g., Maternal Uncle" value={form.relation} onChange={e => set('relation', e.target.value)} id="input-join-relation" />
        </div>
        <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading} id="btn-submit-join" style={{ marginTop: 8 }}>
          {loading ? '⏳ Joining...' : '🎊 Join Wedding'}
        </button>
      </form>
    </div>
  );
}
