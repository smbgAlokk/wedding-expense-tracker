import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { addExpense } from '../api';
import LanguageToggle from '../components/LanguageToggle';
import ThemeToggle from '../components/ThemeToggle';

/** Maximum expense amount (safety guard against accidental huge entries) */
const MAX_AMOUNT = 99_99_99_999; // ~100 crore

/** Accepted image MIME types (no PDFs) */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPT_STRING = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export default function AddExpense() {
  const navigate = useNavigate();
  const { wedding, member, refreshSummary, refreshWedding } = useWedding();
  const { t, tCat, tServer } = useLang();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    category: '',
    amount: '',
    description: '',
    paidBy: member?.name || '',
    vendor: '',
  });
  const [loading, setLoading] = useState(false);
  /** Submit phase: 'uploading' (sending bytes) → 'finalizing' (server processing) → null */
  const [phase, setPhase] = useState(null);
  /** 0–100: live byte-progress while uploading the receipt */
  const [uploadPercent, setUploadPercent] = useState(0);
  const submitRef = useRef(false);
  const amountRef = useRef(null);

  // ─── Receipt state ────────────────────────────────────────────────────
  const [receiptFile, setReceiptFile] = useState(null);     // File object
  const [receiptPreview, setReceiptPreview] = useState(''); // data URL for preview
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const set = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);
  const currency = wedding?.currency || '₹';

  // Refresh wedding data on mount (for latest categories)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshWedding(); }, []);

  // Autofocus amount input when step 2 becomes active
  useEffect(() => {
    if (step === 2 && amountRef.current) {
      const t = setTimeout(() => amountRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Cleanup preview blob URL on unmount / receipt change
  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    };
  }, [receiptPreview]);

  // ─── Receipt handlers ─────────────────────────────────────────────────
  const handleReceiptSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error(t('receipt.errType'));
      e.target.value = ''; // reset input
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t('receipt.errSize'));
      e.target.value = '';
      return;
    }

    // Revoke previous preview URL
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);

    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
    e.target.value = ''; // allow re-selecting same file
  };

  const removeReceipt = () => {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(null);
    setReceiptPreview('');
  };

  // ─── Validation helpers ───────────────────────────────────────────────
  const parseAmount = (raw) => {
    const n = parseFloat(raw);
    if (isNaN(n) || !isFinite(n)) return null;
    return n;
  };

  const validateAmount = (raw) => {
    const n = parseAmount(raw);
    if (n === null || n <= 0) return { ok: false, msg: t('add.errAmount') };
    if (n > MAX_AMOUNT) return { ok: false, msg: t('add.errAmountMax') };
    return { ok: true, value: n };
  };

  // ─── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitRef.current || loading) return;

    if (!form.category) return toast.error(t('add.errCategory'));
    const amtCheck = validateAmount(form.amount);
    if (!amtCheck.ok) return toast.error(amtCheck.msg);

    submitRef.current = true;
    setLoading(true);
    setPhase(receiptFile ? 'uploading' : 'finalizing');
    setUploadPercent(0);

    try {
      // Build FormData when receipt is attached, plain JSON otherwise
      let payload;
      let onProgress;
      if (receiptFile) {
        payload = new FormData();
        payload.append('category', form.category);
        payload.append('amount', amtCheck.value);
        payload.append('description', form.description.trim());
        payload.append('paidBy', form.paidBy.trim() || member?.name || '');
        payload.append('vendor', form.vendor.trim());
        payload.append('receipt', receiptFile);

        onProgress = (e) => {
          if (!e.total) return;
          const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
          setUploadPercent(pct);
          // Once bytes are fully on the wire, server is doing its work (DB + Cloudinary)
          if (pct >= 100) setPhase('finalizing');
        };
      } else {
        payload = {
          category: form.category,
          amount: amtCheck.value,
          description: form.description.trim(),
          paidBy: form.paidBy.trim() || member?.name || '',
          vendor: form.vendor.trim(),
        };
      }

      const res = await addExpense(payload, onProgress);

      // Backend sets a `warning` field when the receipt couldn't be stored
      // (Cloudinary unconfigured / upload failed). Surface it instead of
      // letting the user assume their receipt is attached.
      const warning = res?.data?.warning;
      if (warning) {
        toast(tServer(warning) || warning, { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(t('add.success'));
      }

      refreshSummary();
      navigate('/dashboard');
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      toast.error(tServer(serverMsg) || t('add.errFailed'));
    } finally {
      setLoading(false);
      setPhase(null);
      setUploadPercent(0);
      submitRef.current = false;
    }
  };

  // ─── Step navigation ──────────────────────────────────────────────────
  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else navigate(-1);
  };

  const goToStep3 = () => {
    const amtCheck = validateAmount(form.amount);
    if (!amtCheck.ok) return toast.error(amtCheck.msg || t('add.errAmountSimple'));
    setStep(3);
  };

  const handleAmountKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goToStep3(); }
  };

  const handleDetailKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) { e.preventDefault(); handleSubmit(); }
  };

  const selectedCategory = wedding?.categories?.find(c => c.name === form.category);
  const categories = wedding?.categories || [];

  // ─── Guard: no wedding loaded yet ─────────────────────────────────────
  if (!wedding) {
    return (
      <div className="container page-content" style={{ paddingTop: 20 }}>
        <div className="surface-card empty-state" style={{ padding: 'var(--space-10) var(--space-5)', marginTop: 60 }}>
          <div className="emoji">⏳</div>
          <h3>{t('add.errNoWedding')}</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="container page-content" style={{ paddingTop: 20 }}>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div className="page-header" style={{ flex: 1, minWidth: 0 }}>
          <button className="back-btn" onClick={goBack} aria-label={t('add.backLabel')}>←</button>
          <h1>{t('add.header')}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>

      {/* Step indicator */}
      <div className="step-indicator">
        {[1, 2, 3].map(s => (
          <div key={s} className={`step-segment ${s < step ? 'complete' : s === step ? 'active' : ''}`} />
        ))}
      </div>

      {/* ────────── Step 1: Category ────────── */}
      {step === 1 && (
        <div className="animate-in" key="step-1">
          <h2 className="h2" style={{ marginBottom: 6 }}>{t('add.step1Title')}</h2>
          <p className="text-muted" style={{ marginBottom: 24, fontSize: '0.92rem' }}>{t('add.step1Subtitle')}</p>

          {categories.length === 0 ? (
            <div className="surface-card empty-state" style={{ padding: 'var(--space-10) var(--space-5)' }}>
              <div className="emoji">📂</div>
              <h3>{t('add.noCategories')}</h3>
              <p>{t('add.noCategoriesHint')}</p>
            </div>
          ) : (
            <div className="category-grid stagger">
              {categories.map(cat => (
                <button
                  key={cat.name}
                  className={`category-chip ${form.category === cat.name ? 'active' : ''}`}
                  onClick={() => { set('category', cat.name); setTimeout(() => setStep(2), 220); }}
                  id={`cat-${cat.name.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <span className="emoji">{cat.icon}</span>
                  <span>{tCat(cat.name)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ────────── Step 2: Amount ────────── */}
      {step === 2 && (
        <div className="animate-in" key="step-2">
          <h2 className="h2" style={{ marginBottom: 6 }}>{t('add.step2Title')}</h2>
          <div style={{ marginBottom: 28 }}>
            <span className="pill pill-primary">
              {selectedCategory?.icon} {tCat(form.category)}
            </span>
          </div>
          <div style={{ position: 'relative', marginBottom: 24 }}>
            <span style={{
              position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)',
              fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-muted)', pointerEvents: 'none',
            }}>{currency}</span>
            <input
              ref={amountRef}
              className="form-input form-input-lg text-tnum"
              type="number" inputMode="decimal" placeholder="0"
              value={form.amount} onChange={e => set('amount', e.target.value)}
              onKeyDown={handleAmountKeyDown}
              style={{ paddingLeft: 64 }}
              id="input-expense-amount" min="0" max={MAX_AMOUNT} step="any"
              aria-label={t('add.step2Title')}
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" onClick={goToStep3} id="btn-next-step3">
            {t('common.continue')}
          </button>
        </div>
      )}

      {/* ────────── Step 3: Details + Receipt ────────── */}
      {step === 3 && (
        <div className="animate-in" key="step-3">
          <h2 className="h2" style={{ marginBottom: 6 }}>{t('add.step3Title')}</h2>
          <p className="text-muted" style={{ marginBottom: 24, fontSize: '0.92rem' }}>{t('add.step3Subtitle')}</p>

          {/* Summary chip */}
          <div className="hero-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: 'var(--space-4) var(--space-5)' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              {selectedCategory?.icon} {tCat(form.category)}
            </span>
            <span className="text-tnum" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-light)' }}>
              {currency} {parseFloat(form.amount).toLocaleString('en-IN')}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">{t('add.description')}</label>
            <input className="form-input" placeholder={t('add.descriptionPlaceholder')} value={form.description}
              onChange={e => set('description', e.target.value)} onKeyDown={handleDetailKeyDown}
              id="input-description" maxLength={200} autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('add.paidBy')}</label>
            <input className="form-input" placeholder={member?.name} value={form.paidBy}
              onChange={e => set('paidBy', e.target.value)} onKeyDown={handleDetailKeyDown}
              id="input-paid-by" maxLength={100} autoComplete="name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('add.vendor')}</label>
            <input className="form-input" placeholder={t('add.vendorPlaceholder')} value={form.vendor}
              onChange={e => set('vendor', e.target.value)} onKeyDown={handleDetailKeyDown}
              id="input-vendor" maxLength={150} autoComplete="off"
            />
          </div>

          {/* ── Receipt Upload (optional) ── */}
          <div className="form-group" style={{ marginTop: 4 }}>
            <label className="form-label">{t('receipt.label')}</label>

            {receiptPreview ? (
              /* ── Preview ── */
              <div className="receipt-preview-card">
                <img
                  src={receiptPreview}
                  alt={t('receipt.previewAlt')}
                  className="receipt-preview-img"
                />
                <div className="receipt-preview-meta">
                  <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    🧾 {receiptFile?.name || t('receipt.attached')}
                  </span>
                  <button
                    type="button"
                    onClick={removeReceipt}
                    disabled={loading}
                    className="btn btn-xs"
                    style={{ color: 'var(--danger)', flexShrink: 0, opacity: loading ? 0.5 : 1 }}
                    aria-label={t('receipt.remove')}
                  >
                    ✕ {t('receipt.remove')}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Capture / Gallery buttons ── */
              <div className="receipt-btn-group">
                <button
                  type="button"
                  className="receipt-btn"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={loading}
                  id="btn-receipt-camera"
                >
                  <span className="receipt-btn-icon">📷</span>
                  <span className="receipt-btn-text">{t('receipt.takePhoto')}</span>
                </button>
                <button
                  type="button"
                  className="receipt-btn"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={loading}
                  id="btn-receipt-gallery"
                >
                  <span className="receipt-btn-icon">🖼️</span>
                  <span className="receipt-btn-text">{t('receipt.choosePhoto')}</span>
                </button>
              </div>
            )}

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept={ACCEPT_STRING}
              capture="environment"
              onChange={handleReceiptSelect}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept={ACCEPT_STRING}
              onChange={handleReceiptSelect}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleSubmit} disabled={loading}
            id="btn-save-expense" style={{ marginTop: 8 }}
          >
            {!loading && t('add.submitBtn')}
            {loading && phase === 'uploading' && uploadPercent < 100 &&
              t('add.uploadingProgress', { percent: uploadPercent })}
            {loading && (phase === 'finalizing' || (phase === 'uploading' && uploadPercent >= 100)) &&
              t('add.finalizing')}
            {loading && !phase && t('add.saving')}
          </button>

          {/* Live upload progress bar — only shown while bytes are in flight */}
          {loading && phase === 'uploading' && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadPercent}
              style={{
                height: 4,
                background: 'var(--border, rgba(255,255,255,0.08))',
                borderRadius: 999,
                marginTop: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${uploadPercent}%`,
                  background: 'var(--gradient-primary)',
                  transition: 'width 0.18s ease',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
