import { registerSW } from 'virtual:pwa-register';
import { useSyncExternalStore } from 'react';

type Register = typeof registerSW;

/** Registers the generated service worker and tracks whether a new version is waiting to take over. */
export interface ServiceWorkerController {
  /** Registers `sw.js` right away; later calls do nothing. */
  register(): void;
  subscribe(listener: () => void): () => void;
  /** Whether a new service worker is installed and waiting for the user to reload. */
  updateAvailable(): boolean;
  /** Activates the waiting service worker and reloads the page. */
  applyUpdate(): Promise<void>;
  /** Hides the update notice; the new worker keeps waiting until the next visit. */
  dismiss(): void;
}

export function createServiceWorkerController(register: Register): ServiceWorkerController {
  const listeners = new Set<() => void>();
  let available = false;
  let updateSW: ReturnType<Register> | undefined;

  const setAvailable = (value: boolean) => {
    available = value;
    for (const listener of listeners) listener();
  };

  return {
    register() {
      if (updateSW) return;
      updateSW = register({ immediate: true, onNeedRefresh: () => setAvailable(true) });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateAvailable: () => available,
    async applyUpdate() {
      await updateSW?.(true);
    },
    dismiss: () => setAvailable(false),
  };
}

/** The app's service worker; `main.tsx` registers it on start-up. */
export const serviceWorker = createServiceWorkerController(registerSW);

export function useUpdateAvailable(controller: ServiceWorkerController = serviceWorker): boolean {
  return useSyncExternalStore(controller.subscribe, controller.updateAvailable);
}
