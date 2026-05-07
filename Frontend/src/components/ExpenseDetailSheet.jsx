import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../context/LanguageContext';
import { fmtSimple, fmtDate } from '../utils/format';
import ReceiptViewer from './ReceiptViewer';

/**
 * ExpenseDetailSheet — centered modal rendered via React Portal to
 * guarantee viewport-relative positioning regardless of parent transforms.
 *
 * WHY PORTAL?
 * The parent pages use `.animate-in` which applies `animation: fadeInUp`
 * with `fill-mode: both`. The persisted `transform: translateY(0)` on the
 * animated container creates a new CSS containing block, which breaks
 * `position: fixed` for any descendant — the fixed element becomes
 * relative to the transform parent instead of the viewport.
 * Rendering via `createPortal(…, document.body)` escapes this entirely.
 *
 * Props:
 *  - expense      {object|null}  The expense to display. null = closed.
 *  - currency     {string}       Currency symbol (e.g. '₹')
 *  - categoryIcon {string}       Emoji icon for the category
 *  - onClose      {function}     Called to dismiss the sheet
 *  - onDelete     {function|null} If provided, renders a delete button
 *  - showMember   {boolean}      Whether to show who added it (false for MyExpenses)
 */
export default function ExpenseDetailSheet({
  expense,
  currency = '₹',
  categoryIcon = '📦',
  onClose,
  onDelete,
  showMember = true,
}) {
  const { t, tCat, lang } = useLang();
  const [viewerOpen, setViewerOpen] = useState(false);

  // Close on Escape key — but only if the inner viewer isn't handling it
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape' && !viewerOpen) onClose();
  }, [onClose, viewerOpen]);

  useEffect(() => {
    if (!expense) return;

    document.addEventListener('keydown', handleKey);

    // Lock background scroll — save current position for restoration
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      // Restore scroll position
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [expense, handleKey]);

  if (!expense) return null;

  const memberName = expense.memberId?.name || expense.paidBy || t('common.unknown');
  const memberRelation = expense.memberId?.relation;
  const fullDate = fmtDate(expense.createdAt, lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = (() => {
    try {
      const d = new Date(expense.createdAt);
      const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
      return d.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        numberingSystem: 'latn',
      });
    } catch {
      return '';
    }
  })();

  // ── Portal: render directly to document.body, bypassing parent transforms ──
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-container animate-sheet-up" onClick={(e) => e.stopPropagation()}>
        {/* Drag handle */}
        <div className="sheet-handle-bar">
          <div className="sheet-handle" />
        </div>

        {/* Hero — Category + Amount */}
        <div className="sheet-hero">
          <div className="sheet-category-icon">{categoryIcon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="sheet-category-name">{tCat(expense.category)}</p>
            <h2 className="sheet-amount text-tnum">
              {fmtSimple(expense.amount, currency)}
            </h2>
          </div>
        </div>

        {/* Description (if any) */}
        {expense.description && (
          <div className="sheet-description">
            <p>"{expense.description}"</p>
          </div>
        )}

        {/* Detail rows */}
        <div className="sheet-details">
          {/* Date & Time */}
          <div className="sheet-row">
            <span className="sheet-row-icon">📅</span>
            <div className="sheet-row-content">
              <span className="sheet-row-label">{t('detail.date')}</span>
              <span className="sheet-row-value">{fullDate}{time ? ` · ${time}` : ''}</span>
            </div>
          </div>

          {/* Paid By */}
          <div className="sheet-row">
            <span className="sheet-row-icon">💰</span>
            <div className="sheet-row-content">
              <span className="sheet-row-label">{t('detail.paidBy')}</span>
              <span className="sheet-row-value">{expense.paidBy || memberName}</span>
            </div>
          </div>

          {/* Added By (if showing member info) */}
          {showMember && (
            <div className="sheet-row">
              <span className="sheet-row-icon">👤</span>
              <div className="sheet-row-content">
                <span className="sheet-row-label">{t('detail.addedBy')}</span>
                <span className="sheet-row-value">
                  {memberName}
                  {memberRelation ? ` (${memberRelation})` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Vendor */}
          {expense.vendor && (
            <div className="sheet-row">
              <span className="sheet-row-icon">🏪</span>
              <div className="sheet-row-content">
                <span className="sheet-row-label">{t('detail.vendor')}</span>
                <span className="sheet-row-value">{expense.vendor}</span>
              </div>
            </div>
          )}

          {/* Category */}
          <div className="sheet-row">
            <span className="sheet-row-icon">📂</span>
            <div className="sheet-row-content">
              <span className="sheet-row-label">{t('detail.category')}</span>
              <span className="sheet-row-value">{categoryIcon} {tCat(expense.category)}</span>
            </div>
          </div>
        </div>

        {/* Receipt (if attached) — tap to open full-screen viewer */}
        {expense.receiptUrl && (
          <div className="sheet-receipt-section">
            <p className="sheet-receipt-label">{t('detail.receipt')}</p>
            <button
              type="button"
              className="sheet-receipt-img-wrap sheet-receipt-img-btn"
              onClick={() => setViewerOpen(true)}
              aria-label={t('receipt.viewReceipt')}
            >
              <img
                src={expense.receiptUrl}
                alt={t('receipt.previewAlt')}
                className="sheet-receipt-img"
                loading="lazy"
              />
              <span className="sheet-receipt-hover-hint" aria-hidden="true">
                🔍 {t('receipt.tapToZoom')}
              </span>
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="sheet-actions">
          <button className="btn btn-secondary btn-full" onClick={onClose} id="btn-close-sheet">
            {t('detail.close')}
          </button>
          {onDelete && (
            <button
              className="btn btn-full"
              onClick={() => { onDelete(expense._id); onClose(); }}
              id="btn-delete-from-sheet"
              style={{
                background: 'none',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                fontWeight: 600,
              }}
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {/* Full-screen receipt viewer (zoom/pan/download) — rendered above the sheet */}
      {viewerOpen && expense.receiptUrl && (
        <ReceiptViewer
          url={expense.receiptUrl}
          filename={`receipt-${tCat(expense.category) || 'expense'}-${(expense._id || '').slice(-6)}`}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>,
    document.body
  );
}
