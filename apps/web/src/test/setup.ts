import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import i18n from '@/i18n';

// Component tests always run in Spanish, whatever the machine's locale.
await i18n.changeLanguage('es');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
