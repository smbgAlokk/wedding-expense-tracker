import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { useAICoach } from '@/features/coach/AICoachContext';
import { fmtDate } from '@/utils/format';
import { updateWedding } from '@/api';
import { cacheInvalidate } from '@/utils/dataCache';
import { getMissingDefaults, getDefaultBucketFor, resolveBucket } from '@/constants/defaultCategories';
import LanguageToggle from '@/components/LanguageToggle';
import ThemeToggle from '@/components/ThemeToggle';
import CoachConsentModal from '@/features/coach/CoachConsentModal';
import AccountCard from './AccountCard';
import LockSwitch from '@/components/LockSwitch';
import type { Category, BudgetBucket } from '@/types';
import { BUDGET_BUCKETS, DEFAULT_BUDGET_ALLOCATION } from '@/types';
import RollText from '@/components/RollText';

export default function Settings() {
  const navigate = useNavigate();
  const { wedding, member, isAdmin, features, workspaceType, logout, refreshWedding } = useWedding();
  const { t, tCat, tServer, lang } = useLang();
  const [editing, setEditing] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [form, setForm] = useState({
    weddingName: wedding?.weddingName || '',
    partner1: wedding?.coupleNames?.partner1 || '',
    partner2: wedding?.coupleNames?.partner2 || '',
    weddingDate: wedding?.weddingDate ? new Date(wedding.weddingDate).toISOString().split('T')[0] : '',
    totalBudget: wedding?.totalBudget || '',
    currency: wedding?.currency || '₹',
    // payDay lives as a string in the form so '' represents "cleared" cleanly.
    // The handleSave converter promotes '' to null and a numeric string to int.
    payDay: wedding?.payDay != null ? String(wedding.payDay) : '',
  });

  // L0 — Budget allocation editor state. Mirrored from the wedding so the
  // editor reflects the latest server-side values when entering edit mode.
  // Strings (not numbers) so the user can clear an input mid-typing; the
  // handleSave converter parses + validates sum===100 before persisting.
  const [allocForm, setAllocForm] = useState({
    need:   String(wedding?.budgetAllocation?.need   ?? DEFAULT_BUDGET_ALLOCATION.need),
    want:   String(wedding?.budgetAllocation?.want   ?? DEFAULT_BUDGET_ALLOCATION.want),
    saving: String(wedding?.budgetAllocation?.saving ?? DEFAULT_BUDGET_ALLOCATION.saving),
  });
  const allocSum = (parseInt(allocForm.need, 10) || 0)
                 + (parseInt(allocForm.want, 10) || 0)
                 + (parseInt(allocForm.saving, 10) || 0);

  // L3 — AI Coach status comes from the app-root AICoachProvider. The local
  // state we keep here is purely UI: whether the toggle is mid-flight and
  // whether the consent modal is open. Status itself, mutators, and the
  // single-fetch-per-session guarantee live in the context.
  const { status: aiStatus, enable: enableAI, disable: disableAI } = useAICoach();
  const [aiBusy, setAiBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const handleToggleAI = async () => {
    if (!aiStatus) return;
    if (aiStatus.enabled) {
      // Disabling — no consent flow, just confirm via toast for clarity
      setAiBusy(true);
      try {
        await disableAI();
        toast.success(t('settings.ai.toast.disabled'));
      } catch (err: any) {
        toast.error(tServer(err.response?.data?.message) || t('settings.ai.toast.errToggle'));
      } finally { setAiBusy(false); }
    } else {
      // Enabling — show consent modal first
      setConsentOpen(true);
    }
  };

  const handleAcceptConsent = async () => {
    setAiBusy(true);
    try {
      await enableAI();
      setConsentOpen(false);
      toast.success(t('settings.ai.toast.enabled'));
    } catch (err: any) {
      toast.error(tServer(err.response?.data?.message) || t('settings.ai.toast.errToggle'));
    } finally { setAiBusy(false); }
  };
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: '📦' });
  const [categories, setCategories] = useState(wedding?.categories || []);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    // Normalize the pay-day field: '' / null → clear, anything else → int.
    // The 1-31 range is enforced client-side here as a UX guard; the backend
    // re-validates so a forged request still gets rejected.
    let payDayPayload: number | null | undefined = undefined;
    if (features.monthlyBudget) {
      const raw = (form.payDay ?? '').toString().trim();
      if (raw === '') {
        payDayPayload = null;
      } else {
        const n = parseInt(raw, 10);
        if (!Number.isInteger(n) || n < 1 || n > 31) {
          return toast.error(t('settings.payDay.errInvalid'));
        }
        payDayPayload = n;
      }
    }

    // L0 — normalize and pre-validate the budget allocation (Personal only).
    // Sum-to-100 + integer + 0-100 range. Backend re-validates so a forged
    // request still gets rejected; the client check is purely UX so the user
    // gets an inline toast instead of a generic 400.
    let budgetAllocationPayload: { need: number; want: number; saving: number } | undefined = undefined;
    if (features.monthlyBudget) {
      const need = parseInt(allocForm.need, 10);
      const want = parseInt(allocForm.want, 10);
      const saving = parseInt(allocForm.saving, 10);
      const allInts = Number.isInteger(need) && Number.isInteger(want) && Number.isInteger(saving);
      const inRange = [need, want, saving].every((n) => n >= 0 && n <= 100);
      if (!allInts || !inRange) {
        return toast.error(t('settings.alloc.errInvalid'));
      }
      if (need + want + saving !== 100) {
        return toast.error(t('settings.alloc.errSum', { sum: need + want + saving }));
      }
      budgetAllocationPayload = { need, want, saving };
    }

    setSaving(true);
    try {
      await updateWedding({
        ...form,
        totalBudget: Number(form.totalBudget) || 0,
        categories,
        // Only include payDay / budgetAllocation for monthly-budget verticals;
        // other workspace types would get a 400 from the backend's guards.
        ...(payDayPayload !== undefined ? { payDay: payDayPayload } : {}),
        ...(budgetAllocationPayload !== undefined ? { budgetAllocation: budgetAllocationPayload } : {}),
      });
      await refreshWedding();
      // Workspace settings that affect Insights computation: totalBudget,
      // currency, budgetAllocation, payDay (drives runway view). Bust the
      // analytics cache so the next /insights visit recomputes against the
      // updated allocation + budget.
      cacheInvalidate('analytics:');
      toast.success(t('settings.savedOk'));
      setEditing(false);
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('settings.errSave'));
    } finally { setSaving(false); }
  };

  // Persist a new categories list to the server with optimistic UI: update local
  // state immediately, fire the PUT, refresh from server on success, rollback
  // on failure. Replaces the previous draft+Save two-step where additions only
  // committed to local state — users would refresh and lose their changes
  // because the Save Categories button only showed up on length changes and
  // could be easy to miss.
  const persistCategories = async (next: Category[], successMsgKey: string, successMsgVars?: Record<string, string | number>) => {
    const prev = categories;
    setCategories(next);
    try {
      await updateWedding({ categories: next });
      await refreshWedding();
      // Category list (especially bucket assignments) drives the Insights
      // page's bucket coloring + Budget Score math. Bust the analytics
      // cache so the next /insights visit recomputes everything with the
      // new bucket assignments.
      cacheInvalidate('analytics:');
      toast.success(t(successMsgKey, successMsgVars));
    } catch (err: any) {
      setCategories(prev); // rollback
      toast.error(tServer(err.response?.data?.message) || t('settings.errSave'));
    }
  };

  const addCategory = () => {
    if (!newCat.name.trim()) return toast.error(t('settings.errCategoryName'));
    if (categories.find(c => c.name.toLowerCase() === newCat.name.toLowerCase())) return toast.error(t('settings.errCategoryExists'));
    // L0 — seed the bucket from the canonical defaults if the name matches
    // (e.g. admin re-adds "Groceries" → seeded as Need, not Want). Custom
    // names fall back to DEFAULT_BUCKET ('want'); user can re-bucket inline.
    const seededBucket = features.monthlyBudget
      ? getDefaultBucketFor(newCat.name.trim(), workspaceType)
      : undefined;
    const next: Category[] = [
      ...categories,
      {
        name: newCat.name.trim(),
        icon: newCat.icon || '📦',
        budgetLimit: 0,
        ...(seededBucket ? { bucket: seededBucket } : {}),
      },
    ];
    setNewCat({ name: '', icon: '📦' });
    persistCategories(next, 'settings.categoryAdded', { name: newCat.name.trim() });
  };

  const removeCategory = (name: string) => {
    const next = categories.filter(c => c.name !== name);
    persistCategories(next, 'settings.categoryRemoved', { name });
  };

  // L0 — cycle a category's bucket: Need → Want → Saving → Need. Tappable on
  // each category pill (Personal-only). Optimistic UI + autosave via the
  // existing persistCategories helper, so the user never has to hit a
  // separate "Save buckets" button.
  const cycleCategoryBucket = (name: string) => {
    const idx = categories.findIndex(c => c.name === name);
    if (idx < 0) return;
    const current = resolveBucket(categories[idx]);
    const nextBucket = BUDGET_BUCKETS[(BUDGET_BUCKETS.indexOf(current) + 1) % BUDGET_BUCKETS.length];
    const next = categories.map((c, i) => i === idx ? { ...c, bucket: nextBucket } : c);
    persistCategories(next, `settings.bucket.changed.${nextBucket}`, { name });
  };

  // Compute which canonical defaults are missing from the current list, scoped
  // to the workspace's vertical. Without passing `workspaceType` this defaulted
  // to wedding categories — on a Personal workspace that surfaced an "Add 18
  // suggested wedding categories" button that would inject wedding-specific
  // entries into the user's personal budget.
  const missingDefaults = getMissingDefaults(categories, workspaceType);

  const addMissingDefaults = () => {
    if (missingDefaults.length === 0) return;
    const newOnes = missingDefaults.map(d => ({ ...d, budgetLimit: 0 }));
    const next = [...categories, ...newOnes];
    persistCategories(next, 'settings.suggestedCategoriesAdded', { count: newOnes.length });
  };

  const approvalOn = wedding?.joinApproval !== false;
  const [approvalBusy, setApprovalBusy] = useState(false);
  const toggleJoinApproval = async () => {
    setApprovalBusy(true);
    try {
      await updateWedding({ joinApproval: !approvalOn });
      await refreshWedding();
      toast.success(t(approvalOn ? 'settings.approvalOff' : 'settings.approvalOn'));
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('settings.errSave'));
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    toast.success(t('settings.signedOut'));
  };

  // Tell the user exactly how they'll get back in — and warn if they can't yet.
  const signOutBodyKey = member?.email
    ? (features.multiMember ? 'settings.signOutBodyEmail' : 'settings.signOutBody')
    : (member?.pinSetAt ? 'settings.signOutBodyPin' : 'settings.signOutBodyNoPin');

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Back">←</button>
        <h1>{t('settings.header')}</h1>
      </div>

      {/* Preferences row — language + theme */}
      <div className="surface-card" style={{ marginBottom: 16, padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>🌐 {t('settings.languageLabel')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
            {lang === 'hi' ? 'हिन्दी' : 'English'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>

      <AccountCard />

      {/* Workspace Info — wedding-specific fields (couple names, wedding date)
          are hidden for single-member verticals (Personal). The budget label
          shifts from "Total Budget" to "Monthly Budget" for monthly verticals. */}
      <div className="surface-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
            {features.multiMember ? t('settings.weddingDetails') : t('settings.budgetDetails')}
          </h3>
          {isAdmin && !editing && (
            <button className="btn btn-secondary btn-xs" onClick={() => setEditing(true)}><RollText>{t('common.edit')}</RollText></button>
          )}
        </div>

        {editing ? (
          <>
            <div className="form-group">
              <label className="form-label">
                {features.multiMember ? t('settings.weddingName') : t('settings.budgetName')}
              </label>
              <input className="form-input" value={form.weddingName} onChange={e => set('weddingName', e.target.value)} />
            </div>
            {features.multiMember && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">{t('settings.partner1')}</label>
                    <input className="form-input" value={form.partner1} onChange={e => set('partner1', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('settings.partner2')}</label>
                    <input className="form-input" value={form.partner2} onChange={e => set('partner2', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('settings.weddingDate')}</label>
                  <input className="form-input" type="date" value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)} />
                </div>
              </>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">
                  {features.monthlyBudget ? t('settings.monthlyBudget') : t('settings.totalBudget')}
                </label>
                <input className="form-input" type="number" inputMode="decimal" value={form.totalBudget} onChange={e => set('totalBudget', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.currency')}</label>
                <select className="form-input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option value="₹">₹ INR</option>
                  <option value="$">$ USD</option>
                  <option value="€">€ EUR</option>
                  <option value="£">£ GBP</option>
                </select>
              </div>
            </div>
            {/* Pay-day picker — only meaningful for monthly-budget verticals
                (Personal). Empty value = no runway tile; 1-31 = enables the
                "Until next payday" dashboard insight. */}
            {features.monthlyBudget && (
              <div className="form-group">
                <label className="form-label" htmlFor="settings-pay-day">
                  {t('settings.payDay.label')}
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  <input
                    id="settings-pay-day"
                    className="form-input text-tnum"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    step={1}
                    placeholder={t('settings.payDay.placeholder')}
                    value={form.payDay}
                    onChange={e => {
                      // Strip everything except digits; keep '' as the cleared
                      // sentinel. Avoids '01' / '1.5' / 'e+1' edge cases the
                      // bare number input lets through.
                      const cleaned = e.target.value.replace(/\D/g, '').slice(0, 2);
                      set('payDay', cleaned);
                    }}
                    style={{ flex: 1 }}
                  />
                  {form.payDay && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => set('payDay', '')}
                      aria-label={t('settings.payDay.clear')}
                    >
                      <RollText>{t('settings.payDay.clear')}</RollText>
                    </button>
                  )}
                </div>
                <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 6, lineHeight: 1.45 }}>
                  {t('settings.payDay.help')}
                </p>
              </div>
            )}
            {/* L0 — Budget Allocation editor (Personal only). Three integer
                inputs that must sum to exactly 100. Live sum indicator
                turns red when off-target so users self-correct before save. */}
            {features.monthlyBudget && (
              <div className="form-group">
                <label className="form-label">{t('settings.alloc.label')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {(['need', 'want', 'saving'] as const).map((b) => (
                    <div key={b}>
                      <label
                        htmlFor={`alloc-${b}`}
                        className="text-muted"
                        style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}
                      >
                        {t(`settings.alloc.${b}`)}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          id={`alloc-${b}`}
                          className={`form-input text-tnum bucket-input bucket-input-${b}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          step={1}
                          value={allocForm[b]}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/\D/g, '').slice(0, 3);
                            setAllocForm((p) => ({ ...p, [b]: cleaned }));
                          }}
                          style={{ paddingRight: 26 }}
                          aria-label={t(`settings.alloc.${b}`)}
                        />
                        <span
                          aria-hidden="true"
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem', pointerEvents: 'none' }}
                        >%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p
                  className="text-tnum"
                  style={{
                    fontSize: '0.78rem',
                    marginTop: 8,
                    fontWeight: 700,
                    color: allocSum === 100 ? 'var(--success)' : 'var(--danger)',
                  }}
                  aria-live="polite"
                >
                  {allocSum === 100
                    ? t('settings.alloc.sumOk')
                    : t('settings.alloc.sumBad', { sum: allocSum })}
                </p>
                <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4, lineHeight: 1.45 }}>
                  {t('settings.alloc.help')}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                <RollText>{saving ? t('settings.saving') : t('settings.saveBtn')}</RollText>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}><RollText>{t('common.cancel')}</RollText></button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.92rem', lineHeight: 1.9, color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{wedding?.weddingName}</p>
            {features.multiMember && (
              <>
                <p>{t('settings.coupleLabel', { p1: wedding?.coupleNames?.partner1 || '', p2: wedding?.coupleNames?.partner2 || '' })}</p>
                <p>{t('settings.dateLabel', { date: wedding?.weddingDate ? fmtDate(wedding.weddingDate, lang, { day: 'numeric', month: 'long', year: 'numeric' }) : t('common.notSet') })}</p>
              </>
            )}
            <p className="text-tnum">
              {features.monthlyBudget
                ? t('settings.monthlyBudgetLabel', { currency: wedding?.currency || '₹', amount: (wedding?.totalBudget || 0).toLocaleString('en-IN') })
                : t('settings.budgetLabel', { currency: wedding?.currency || '₹', amount: (wedding?.totalBudget || 0).toLocaleString('en-IN') })}
            </p>
            {features.monthlyBudget && (
              <p className="text-tnum">
                {wedding?.payDay != null
                  ? t('settings.payDay.viewLabel', { day: wedding.payDay })
                  : t('settings.payDay.viewLabelUnset')}
              </p>
            )}
            {features.monthlyBudget && (
              <p className="text-tnum">
                {t('settings.alloc.viewLabel', {
                  need:   wedding?.budgetAllocation?.need   ?? DEFAULT_BUDGET_ALLOCATION.need,
                  want:   wedding?.budgetAllocation?.want   ?? DEFAULT_BUDGET_ALLOCATION.want,
                  saving: wedding?.budgetAllocation?.saving ?? DEFAULT_BUDGET_ALLOCATION.saving,
                })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* L3 — AI Coach toggle (Personal-only, monthly-budget verticals). The
          card is always shown when monthlyBudget is enabled and AI Coach is
          configured server-side; when unconfigured, it surfaces a gentle
          "AI Coach is currently unavailable" placeholder rather than hiding
          completely so users know the feature exists. */}
      {features.monthlyBudget && aiStatus && (
        <div className="surface-card ai-settings-card" style={{ marginBottom: 16 }}>
          <div className="ai-settings-head">
            <div className="ai-settings-head-text">
              <h3>{t('settings.ai.title')}</h3>
              <p className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                {aiStatus.configured
                  ? aiStatus.enabled
                    ? t('settings.ai.descOn')
                    : t('settings.ai.descOff')
                  : t('settings.ai.descUnavailable')}
              </p>
            </div>
            {aiStatus.configured && (
              <button
                type="button"
                className={`ai-toggle ${aiStatus.enabled ? 'is-on' : ''}`}
                onClick={handleToggleAI}
                disabled={aiBusy}
                role="switch"
                aria-checked={aiStatus.enabled}
                aria-label={t(aiStatus.enabled ? 'settings.ai.ariaOn' : 'settings.ai.ariaOff')}
              >
                <span className="ai-toggle-knob" />
              </button>
            )}
          </div>
          {aiStatus.configured && aiStatus.enabled && aiStatus.quota && (
            <div className="ai-settings-quota">
              <span className="text-tnum">
                {t('settings.ai.quotaDaily', {
                  used: aiStatus.quota.daily.used,
                  limit: aiStatus.quota.daily.limit,
                })}
              </span>
              <span className="text-tnum">
                {t('settings.ai.quotaMonthly', {
                  used: aiStatus.quota.monthly.used,
                  limit: aiStatus.quota.monthly.limit,
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* L3 — Consent modal portal-rendered. State-only when consentOpen=true. */}
      <CoachConsentModal
        open={consentOpen}
        onCancel={() => setConsentOpen(false)}
        onAccept={handleAcceptConsent}
        busy={aiBusy}
      />

      {/* Categories */}
      {isAdmin && (
        <div className="surface-card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>{t('settings.categoriesHeader')}</h3>

          {missingDefaults.length > 0 && (
            <button
              type="button"
              onClick={addMissingDefaults}
              className="btn btn-secondary btn-sm btn-full"
              style={{
                marginBottom: 14,
                background: 'var(--primary-100)',
                borderColor: 'var(--primary-200)',
                color: 'var(--primary)',
                fontWeight: 600,
              }}
            >
              <RollText>{t('settings.suggestedCategories', { count: missingDefaults.length })}</RollText>
            </button>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {categories.map(cat => {
              // L0 — Personal-only bucket badge. Tappable to cycle the bucket
              // assignment in-place (Need → Want → Saving). For Wedding/Trip
              // we render the pill as before; the bucket field is irrelevant.
              const bucket: BudgetBucket | null = features.monthlyBudget ? resolveBucket(cat) : null;
              return (
                <div key={cat.name} className="pill" style={{ paddingRight: 8 }}>
                  <span>{cat.icon}</span>
                  <span>{tCat(cat.name)}</span>
                  {bucket && (
                    <button
                      type="button"
                      onClick={() => cycleCategoryBucket(cat.name)}
                      className={`bucket-badge bucket-badge-${bucket}`}
                      aria-label={t('settings.bucket.cycleAria', { name: tCat(cat.name), bucket: t(`settings.alloc.${bucket}`) })}
                      title={t('settings.bucket.cycleTitle')}
                    >
                      {t(`settings.bucket.short.${bucket}`)}
                    </button>
                  )}
                  <button onClick={() => removeCategory(cat.name)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 0 2px', marginLeft: 2, lineHeight: 1 }}>✕</button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder={t('settings.newCategoryPlaceholder')} value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} style={{ flex: 1, minHeight: 44, fontSize: '0.9rem' }} />
            <button className="btn btn-primary btn-sm" onClick={addCategory}><RollText>{t('settings.addCategory')}</RollText></button>
          </div>
          {/* Categories auto-save on add / remove — no separate Save button needed. */}
        </div>
      )}

      {/* Join Code — only shown for verticals that have one (Wedding, Trip).
          Personal workspaces never surface a join code. */}
      {features.joinCode && wedding?.joinCode && (
        <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 16 }}>
          <p className="section-title" style={{ marginBottom: 8 }}>{t('settings.joinCode')}</p>
          <div className="text-tnum" style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '7px', color: 'var(--primary-light)', marginBottom: 12 }}>
            {wedding.joinCode}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { navigator.clipboard.writeText(wedding.joinCode); toast.success(t('common.copied')); }}
          >
            <RollText>{t('settings.copy')}</RollText>
          </button>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)', textAlign: 'left' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>🛡️ {t('settings.approvalLabel')}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2, lineHeight: 1.4 }}>
                  {t(approvalOn ? 'settings.approvalHintOn' : 'settings.approvalHintOff')}
                </p>
              </div>
              <LockSwitch
                checked={approvalOn}
                onChange={() => toggleJoinApproval()}
                disabled={approvalBusy}
                label={t('settings.approvalLabel')}
                id="toggle-join-approval"
              />
            </div>
          )}
        </div>
      )}

      {/* Members shortcut — single-member verticals hide this (no one else exists). */}
      {features.multiMember && (
        <button className="btn btn-secondary btn-full" onClick={() => navigate('/members')} style={{ marginBottom: 12 }}>
          <RollText>{t('settings.viewMembers')}</RollText>
        </button>
      )}

      <button className="btn btn-danger btn-full" onClick={() => setShowLeaveModal(true)} id="btn-logout" style={{ marginBottom: 40 }}>
        <RollText>{t('settings.signOut')}</RollText>
      </button>

      {/* Leave Confirmation Modal */}
      {showLeaveModal && (
        <div className="modal-backdrop" onClick={() => setShowLeaveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>👋</div>
            <h2 className="h2" style={{ marginBottom: 8 }}>{t('settings.signOutTitle')}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.55 }}>
              {t(signOutBodyKey, { wedding: wedding?.weddingName || '' })}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-danger btn-full btn-lg" onClick={handleLogout} id="btn-confirm-leave">
                <RollText>{t('settings.signOutYes')}</RollText>
              </button>
              <button className="btn btn-ghost btn-full" onClick={() => setShowLeaveModal(false)} id="btn-cancel-leave">
                <RollText>{t('common.cancel')}</RollText>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
