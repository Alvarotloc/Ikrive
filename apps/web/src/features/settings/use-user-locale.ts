import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsQuery } from './queries';

/**
 * Applies the locale saved in the user's settings. Lives in the authenticated layout, so it runs on
 * every page load and whenever the settings change (e.g. after saving them in Settings). The
 * language only changes when it differs from the active one; i18n then remembers it in the browser.
 */
export function useUserLocale() {
  const { i18n } = useTranslation();
  const { data } = useQuery(settingsQuery);
  const locale = data?.locale;

  useEffect(() => {
    if (locale && locale !== i18n.language) void i18n.changeLanguage(locale);
  }, [locale, i18n]);
}
