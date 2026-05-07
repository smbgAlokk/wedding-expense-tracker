import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  translations,
  translateServerMessage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from '../i18n/translations';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'language';

function readInitialLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) return stored;
  } catch {
    // localStorage may be unavailable in private mode — silently fall through.
  }
  return DEFAULT_LANGUAGE;
}

// Replace {placeholders} in a string. Unknown placeholders are left as-is so
// translation bugs are visible to the dev rather than silently swallowing data.
function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
  );
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);

  // Persist + reflect on <html lang="..."> for screen readers and font selection.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', lang);
    }
  }, [lang]);

  const setLang = useCallback((next) => {
    if (SUPPORTED_LANGUAGES.includes(next)) setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'hi' ? 'en' : 'hi'));
  }, []);

  // Core translator. Falls back: current lang → default lang → key itself.
  const t = useCallback((key, vars) => {
    const dict = translations[lang] || translations[DEFAULT_LANGUAGE];
    const fallback = translations[DEFAULT_LANGUAGE];
    const raw = (dict && dict[key]) ?? (fallback && fallback[key]) ?? key;
    return interpolate(raw, vars);
  }, [lang]);

  // Category translator: known canonical names → translated; unknown
  // (admin-added custom categories) pass through unchanged.
  const tCat = useCallback((name) => {
    if (!name) return '';
    const dict = translations[lang] || translations[DEFAULT_LANGUAGE];
    return (dict && dict[`cat.${name}`]) ?? name;
  }, [lang]);

  // Server message translator (best-effort).
  const tServer = useCallback((message) => translateServerMessage(message, lang), [lang]);

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, tCat, tServer }),
    [lang, setLang, toggleLang, t, tCat, tServer]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within a LanguageProvider');
  return ctx;
}
