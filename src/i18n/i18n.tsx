import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { thaiMessages } from './messages';
import { readLanguagePreference, writeLanguagePreference } from './preference';

export type Language = 'en' | 'th';
type MessageValues = Record<string, string | number>;

export function translate(language: Language, message: string, values: MessageValues = {}): string {
  const template = language === 'th' ? thaiMessages[message] ?? message : message;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder);
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (message: string, values?: MessageValues) => string;
}

const I18nContext = createContext<I18nValue>({
  language: 'en',
  setLanguage: () => {},
  t: message => message,
});

export function I18nProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: Language }) {
  const [language, setLanguageState] = useState<Language>(() => initialLanguage ?? readLanguagePreference());
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeLanguagePreference(next);
  }, []);
  const t = useCallback((message: string, values?: MessageValues) => translate(language, message, values), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
