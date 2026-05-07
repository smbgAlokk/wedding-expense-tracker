import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';

export default function ThemeToggle({ style, className }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; }
  });
  const { t } = useLang();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const tooltip = theme === 'dark' ? t('theme.toLight') : t('theme.toDark');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle ${className || ''}`}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-color)',
        borderRadius: '50%',
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.1rem',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)',
        color: 'var(--text-primary)',
        transition: 'var(--transition)',
        flexShrink: 0,
        ...style,
      }}
      aria-label={tooltip}
      title={tooltip}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
