import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/context/LanguageContext';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/**
 * L3 — AI Coach consent modal.
 *
 * Shown ONCE before the user's first enable. We do not persist a separate
 * "consent acknowledged" flag — the act of clicking "Enable" IS the
 * consent record. Disabling and re-enabling shows the modal again because
 * the user may want to re-read the explainer.
 *
 * Single explainer + two buttons. No multi-step wizard. Owner brief was
 * explicit: "not too complex in that in the perspective of the users."
 */
interface Props {
  open: boolean;
  onCancel: () => void;
  onAccept: () => void;
  busy?: boolean;
}

export default function CoachConsentModal({ open, onCancel, onAccept, busy }: Props) {
  const { t } = useLang();
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="modal-content coach-consent"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-consent-title"
      >
        <header className="coach-consent-head">
          <span className="coach-consent-icon" aria-hidden="true">🤖</span>
          <h2 id="coach-consent-title">{t('coach.consent.title')}</h2>
        </header>

        <div className="coach-consent-body">
          <p>{t('coach.consent.intro')}</p>

          <h3>{t('coach.consent.h.sent')}</h3>
          <ul>
            <li>{t('coach.consent.sent.totals')}</li>
            <li>{t('coach.consent.sent.categories')}</li>
            <li>{t('coach.consent.sent.vendors')}</li>
            <li>{t('coach.consent.sent.allocation')}</li>
          </ul>

          <h3>{t('coach.consent.h.notSent')}</h3>
          <ul>
            <li>{t('coach.consent.notSent.identity')}</li>
            <li>{t('coach.consent.notSent.payment')}</li>
            <li>{t('coach.consent.notSent.receipts')}</li>
          </ul>

          <p className="coach-consent-fine">{t('coach.consent.fine')}</p>
        </div>

        <div className="coach-consent-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onAccept}
            disabled={busy}
          >
            {busy ? t('coach.consent.busy') : t('coach.consent.accept')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
