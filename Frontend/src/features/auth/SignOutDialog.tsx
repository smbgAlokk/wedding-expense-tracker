import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import RollText from '@/components/RollText';

// Shared sign-out confirmation (Settings + desktop sidebar). Portalled to
// <body>: the sidebar's backdrop-filter would otherwise trap a fixed overlay.
export default function SignOutDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { wedding, member, features, logout } = useWedding();
  const { t } = useLang();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(true);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Tell the user exactly how they'll get back in — and warn if they can't yet.
  const bodyKey = member?.email
    ? (features.multiMember ? 'settings.signOutBodyEmail' : 'settings.signOutBody')
    : (member?.pinSetAt ? 'settings.signOutBodyPin' : 'settings.signOutBodyNoPin');

  const signOut = () => {
    logout();
    navigate('/');
    toast.success(t('settings.signedOut'));
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sign-out-title">
        <div style={{ fontSize: '3rem', marginBottom: 12 }} aria-hidden="true">👋</div>
        <h2 className="h2" id="sign-out-title" style={{ marginBottom: 8 }}>{t('settings.signOutTitle')}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: 24, lineHeight: 1.55 }}>
          {t(bodyKey, { wedding: wedding?.weddingName || '' })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-danger btn-full btn-lg" onClick={signOut} id="btn-confirm-leave">
            <RollText>{t('settings.signOutYes')}</RollText>
          </button>
          <button className="btn btn-ghost btn-full" onClick={onClose} id="btn-cancel-leave" ref={cancelRef}>
            <RollText>{t('common.cancel')}</RollText>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
