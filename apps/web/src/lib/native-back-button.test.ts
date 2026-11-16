import { afterEach, describe, expect, it, vi } from 'vitest';
import { minimizeApp, onBackButton } from './native-back-button';

const plugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  minimizeApp: vi.fn(),
}));
vi.mock('@capacitor/app', () => ({ App: plugin }));

afterEach(() => {
  plugin.addListener.mockReset();
  plugin.minimizeApp.mockReset();
});

describe('native back button', () => {
  it('calls the listener on every back press and removes it', async () => {
    let press: ((event: { canGoBack: boolean }) => void) | undefined;
    const remove = vi.fn(async () => {});
    plugin.addListener.mockImplementation(async (_event: string, callback: typeof press) => {
      press = callback;
      return { remove };
    });
    const listener = vi.fn();

    const stop = await onBackButton(listener);

    expect(plugin.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
    press?.({ canGoBack: true });
    press?.({ canGoBack: false });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();

    await stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('minimizes the app', async () => {
    plugin.minimizeApp.mockResolvedValueOnce(undefined);
    await minimizeApp();
    expect(plugin.minimizeApp).toHaveBeenCalledTimes(1);

    plugin.minimizeApp.mockRejectedValueOnce(new Error('Plugin not implemented'));
    await expect(minimizeApp()).rejects.toThrow('Plugin not implemented');
  });
});
