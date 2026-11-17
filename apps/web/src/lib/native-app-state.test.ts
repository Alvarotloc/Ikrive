import { afterEach, describe, expect, it, vi } from 'vitest';
import { onAppResume } from './native-app-state';

const plugin = vi.hoisted(() => ({ addListener: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: plugin }));

afterEach(() => {
  plugin.addListener.mockReset();
});

describe('native app state', () => {
  it('calls the listener on every resume and removes it', async () => {
    let resume: (() => void) | undefined;
    const remove = vi.fn(async () => {});
    plugin.addListener.mockImplementation(async (_event: string, callback: typeof resume) => {
      resume = callback;
      return { remove };
    });
    const listener = vi.fn();

    const stop = await onAppResume(listener);

    expect(plugin.addListener).toHaveBeenCalledWith('resume', expect.any(Function));
    resume?.();
    resume?.();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();

    await stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
