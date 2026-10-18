import { SyntheticEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { changePin } from '@/api';
import PinField from '@/components/PinField';
import { pinErrorMessage, pinFormError } from '@/utils/pinErrors';

const EMPTY = { currentPin: '', newPin: '', confirmPin: '' };

// Join-code members: set (first time) or change the PIN used to sign back in.
export default function PinSettings() {
  const { member, wedding, login, refreshMember } = useWedding();
  const { t, tServer } = useLang();
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const status = member?.pinSetAt;
  const hasPin = !!status;

  // Member caches written before PINs existed lack the field — fetch the truth once.
  useEffect(() => {
    if (status === undefined) refreshMember();
  }, [status, refreshMember]);

  if (status === undefined) return null;

  const set = (k: keyof typeof EMPTY, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (hasPin && form.currentPin.length !== 6) return toast.error(t('pin.errLength'));
    const formError = pinFormError(form.newPin, form.confirmPin, t);
    if (formError) return toast.error(formError);

    setSaving(true);
    try {
      const res = await changePin({ newPin: form.newPin, ...(hasPin && { currentPin: form.currentPin }) });
      if (wedding) login(res.data.data.member, wedding);
      toast.success(t('pin.saved'));
      setForm(EMPTY);
      setOpen(false);
    } catch (err) {
      toast.error(pinErrorMessage(err, t, tServer, 'settings.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const showForm = open || !hasPin;

  return (
    <div className="surface-card" style={{ marginBottom: 16, padding: 'var(--space-4) var(--space-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>🔐 {t('pin.label')}</p>
        <span className={`pill ${hasPin ? 'pill-success' : 'pill-warning'}`} role="status" style={{ flexShrink: 0 }}>
          {t(hasPin ? 'pin.set' : 'pin.notSet')}
        </span>
      </div>

      {!hasPin && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5, marginTop: 12 }}>{t('pin.notSetHint')}</p>
      )}

      {showForm ? (
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          {hasPin && (
            <PinField id="input-pin-current" label={t('pin.current')} value={form.currentPin} onChange={(v) => set('currentPin', v)} autoComplete="current-password" autoFocus />
          )}
          <PinField id="input-pin-new" label={t('pin.new')} value={form.newPin} onChange={(v) => set('newPin', v)} autoComplete="new-password" />
          <PinField id="input-pin-confirm" label={t('pin.confirm')} value={form.confirmPin} onChange={(v) => set('confirmPin', v)} autoComplete="new-password" />
          <div style={{ display: 'flex', gap: 8 }}>
            {hasPin && (
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setOpen(false); setForm(EMPTY); }}>
                {t('common.cancel')}
              </button>
            )}
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving} id="btn-save-pin">
              {saving ? t('pin.saving') : t('pin.setBtn')}
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-secondary btn-full" style={{ marginTop: 12 }} onClick={() => setOpen(true)} id="btn-change-pin">
          {t('pin.changeBtn')}
        </button>
      )}
    </div>
  );
}
