import { useLang } from '../context/LanguageContext';

export default function LanguageToggle({ style, className }) {
  const { lang, toggleLang, t } = useLang();
  const label = t('lang.label');
  const tooltip = t('lang.tooltip');

  return (
    <button
      type="button"
      onClick={toggleLang}
      className={`language-toggle ${className || ''}`}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-color)',
        borderRadius: '50%',
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)',
        color: 'var(--text-primary)',
        transition: 'var(--transition)',
        flexShrink: 0,
        letterSpacing: lang === 'en' ? '0.5px' : 0,
        ...style,
      }}
      aria-label={tooltip}
      title={tooltip}
    >
      {label}
    </button>
  );
}
