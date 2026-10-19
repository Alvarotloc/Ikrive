import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getStoredLocale, pickInitialLocale, storeLocale } from './locale';
import en from './locales/en.json';
import es from './locales/es.json';
import { configureZodMessages } from './zod';

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: pickInitialLocale(getStoredLocale(), globalThis.navigator?.language),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

// With inline resources `init` applies the language synchronously, so only later changes
// (the user's settings, a new choice in Settings) are remembered; the browser default is not.
i18n.on('languageChanged', storeLocale);

configureZodMessages(i18n);

export default i18n;
