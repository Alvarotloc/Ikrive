import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { OfflineBanner } from './offline-banner';

const OFFLINE_TEXT = 'Sin conexión. Algunos datos no se podrán cargar hasta que vuelva.';

describe('OfflineBanner', () => {
  it('shows the offline notice while the browser is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    renderWithProviders(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_TEXT);
  });

  it('hides the offline notice when the connection comes back', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByText(OFFLINE_TEXT)).not.toBeInTheDocument();

    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_TEXT);

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(OFFLINE_TEXT)).not.toBeInTheDocument();
  });
});
