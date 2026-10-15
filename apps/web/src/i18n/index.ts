import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import { configureZodMessages } from './zod';

const browserLocale = navigator.language.startsWith('en') ? 'en' : 'es';

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: browserLocale,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

configureZodMessages(i18n);

export default i18n;
