import i18n from '@/i18n';

// Unit tests always run in Spanish, whatever the machine's locale (in Node,
// `navigator.language` comes from the system, e.g. en-US in CI).
await i18n.changeLanguage('es');
