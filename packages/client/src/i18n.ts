import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import fi from './locales/fi.json';

/**
 * UI locales. Content languages are independent and free-form — a project may use
 * a language with no locale file here, in which case the chrome falls back to
 * English while the content still shows in that language.
 */
export const messages = { en, fi };
export type UiLocale = keyof typeof messages;

const STORAGE_KEY = 'wikitail.locale';

function initialLocale(): UiLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in messages) return stored as UiLocale;
  } catch {
    // Private browsing or blocked storage — fall through to the browser language.
  }
  const browser = navigator.language.split('-')[0];
  return browser in messages ? (browser as UiLocale) : 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages,
});

export function setLocale(locale: string) {
  i18n.global.locale.value = (locale in messages ? locale : 'en') as UiLocale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Nothing to do — the choice just will not survive a reload.
  }
}
