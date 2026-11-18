import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCameraGranted } from './native-camera';

const plugin = vi.hoisted(() => ({ checkPermissions: vi.fn() }));
/** Names given to `registerPlugin`, recorded when the module is imported (before any mock is reset). */
const registered = vi.hoisted((): string[] => []);
vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => {
    registered.push(name);
    return plugin;
  },
}));

afterEach(() => {
  plugin.checkPermissions.mockReset();
});

describe('native camera', () => {
  it('is granted only when the camera permission is granted', async () => {
    expect(registered).toEqual(['CameraPermission']);
    const cases = [
      ['granted', true],
      ['prompt', false],
      ['denied', false],
      ['prompt-with-rationale', false],
    ] as const;
    for (const [camera, expected] of cases) {
      plugin.checkPermissions.mockResolvedValueOnce({ camera });
      await expect(isCameraGranted()).resolves.toBe(expected);
    }
    expect(plugin.checkPermissions).toHaveBeenCalledTimes(4);
  });
});
