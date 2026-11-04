import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createServiceWorkerController } from './service-worker';
import { UpdatePrompt } from './update-prompt';

type RegisterOptions = { immediate?: boolean; onNeedRefresh?: () => void };

/** A real controller whose `registerSW` is a fake, so the test decides when a new worker is waiting. */
function setup() {
  const updateSW = vi.fn(async (_reloadPage?: boolean) => {});
  const register = vi.fn((_options?: RegisterOptions) => updateSW);
  const controller = createServiceWorkerController(register);
  controller.register();
  const needRefresh = () => act(() => register.mock.calls[0]?.[0]?.onNeedRefresh?.());
  return {
    controller,
    updateSW,
    needRefresh,
    ...renderWithProviders(<UpdatePrompt controller={controller} />),
  };
}

describe('UpdatePrompt', () => {
  it('shows nothing until an update is waiting', () => {
    setup();

    expect(screen.queryByText('Hay una versión nueva de Ikrive')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recargar' })).not.toBeInTheDocument();
  });

  it('shows the update notice with reload and later buttons', () => {
    const { needRefresh } = setup();

    needRefresh();

    expect(screen.getByRole('status')).toHaveTextContent('Hay una versión nueva de Ikrive');
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más tarde' })).toBeInTheDocument();
  });

  it('reloads with the new worker when clicking Recargar', async () => {
    const { user, updateSW, needRefresh } = setup();
    needRefresh();

    await user.click(screen.getByRole('button', { name: 'Recargar' }));

    expect(updateSW).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('hides the notice when clicking Más tarde', async () => {
    const { user, updateSW, needRefresh } = setup();
    needRefresh();

    await user.click(screen.getByRole('button', { name: 'Más tarde' }));

    expect(screen.queryByText('Hay una versión nueva de Ikrive')).not.toBeInTheDocument();
    expect(updateSW).not.toHaveBeenCalled();
  });
});
