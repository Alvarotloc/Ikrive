import { describe, expect, it, vi } from 'vitest';
import { createServiceWorkerController } from './service-worker';

type RegisterOptions = { immediate?: boolean; onNeedRefresh?: () => void };

/** A fake `registerSW`: records its options and returns a spy standing in for `updateSW`. */
function fakeRegister() {
  const updateSW = vi.fn(async (_reloadPage?: boolean) => {});
  const register = vi.fn((_options?: RegisterOptions) => updateSW);
  const needRefresh = () => register.mock.calls[0]?.[0]?.onNeedRefresh?.();
  return { register, updateSW, needRefresh };
}

describe('service worker controller', () => {
  it('registers the service worker immediately and only once', () => {
    const { register } = fakeRegister();
    const controller = createServiceWorkerController(register);

    controller.register();
    controller.register();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
    expect(controller.updateAvailable()).toBe(false);
  });

  it('reports an update when the new worker is waiting', () => {
    const { register, needRefresh } = fakeRegister();
    const controller = createServiceWorkerController(register);
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.register();

    needRefresh();

    expect(controller.updateAvailable()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('applies the update by reloading through the new worker', async () => {
    const { register, updateSW, needRefresh } = fakeRegister();
    const controller = createServiceWorkerController(register);
    controller.register();
    needRefresh();

    await controller.applyUpdate();

    expect(updateSW).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('dismisses the update without applying it', () => {
    const { register, updateSW, needRefresh } = fakeRegister();
    const controller = createServiceWorkerController(register);
    const listener = vi.fn();
    controller.register();
    needRefresh();
    const unsubscribe = controller.subscribe(listener);

    controller.dismiss();

    expect(controller.updateAvailable()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(updateSW).not.toHaveBeenCalled();

    unsubscribe();
    needRefresh();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
