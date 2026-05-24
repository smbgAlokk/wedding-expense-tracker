import { createContext, useContext } from 'react';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export interface LanguageContextType {
  lang: SupportedLanguage;
  setLang: (lang: SupportedLanguage) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tCat: (name: string) => string;
  tServer: (message?: string) => string;
}

export const LanguageContext = createContext<LanguageContextType | null>(null);

export function useLang(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within a LanguageProvider');
  return ctx;
}
