import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  translations,
  translateServerMessage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from '@/i18n';
import { LanguageContext, type LanguageContextType, type SupportedLanguage } from './LanguageContext';

const STORAGE_KEY = 'language';

function readInitialLang(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as SupportedLanguage;
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) return stored;
  } catch {
    // localStorage may be unavailable in private mode — silently fall through.
  }
  return DEFAULT_LANGUAGE as SupportedLanguage;
}

// Replace {placeholders} in a string.
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
  );
}

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [lang, setLangState] = useState<SupportedLanguage>(readInitialLang);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', lang);
    }
  }, [lang]);

  const setLang = useCallback((next: SupportedLanguage) => {
    if (SUPPORTED_LANGUAGES.includes(next)) setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'hi' ? 'en' : 'hi'));
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const dict = translations[lang] || translations[DEFAULT_LANGUAGE as keyof typeof translations];
    const fallback = translations[DEFAULT_LANGUAGE as keyof typeof translations];
    const raw = (dict && dict[key as keyof typeof dict]) ?? (fallback && fallback[key as keyof typeof fallback]) ?? key;
    return interpolate(raw as string, vars);
  }, [lang]);

  const tCat = useCallback((name: string): string => {
    if (!name) return '';
    const dict = translations[lang] || translations[DEFAULT_LANGUAGE as keyof typeof translations];
    const catKey = `cat.${name}` as keyof typeof dict;
    return (dict && dict[catKey]) ?? name;
  }, [lang]);

  const tServer = useCallback((message?: string): string => translateServerMessage(message, lang), [lang]);

  const value = useMemo<LanguageContextType>(
    () => ({ lang, setLang, toggleLang, t, tCat, tServer }),
    [lang, setLang, toggleLang, t, tCat, tServer]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
