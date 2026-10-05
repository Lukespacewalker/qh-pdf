import type { Language } from './i18n';

export const languagePreferenceKey = 'qh-pdf-language';

export function readLanguagePreference(storage?: Pick<Storage, 'getItem'>): Language {
  try {
    const available = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return available?.getItem(languagePreferenceKey) === 'th' ? 'th' : 'en';
  } catch {
    return 'en';
  }
}

export function writeLanguagePreference(language: Language, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const available = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    available?.setItem(languagePreferenceKey, language);
  } catch {
    // Language changes still apply when private browsing or storage policy blocks persistence.
  }
}
