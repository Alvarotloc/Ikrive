import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { setLocalMode } from '@/lib/app-mode';
import { type DataSource, setDataSource } from '@/lib/data-source';
import { httpDataSource } from '@/lib/data-source/http';

/**
 * The local `DataSource` over the device database, opened (and migrated) once per app run: leaving the
 * local mode keeps it open, so coming back reuses it. Dropped if opening fails, so the next try starts over.
 */
let local: Promise<DataSource> | null = null;

/**
 * Opens the device database and builds its `DataSource` with the device file store and the canvas image
 * processing; these modules are only loaded in local mode.
 */
async function openLocalDataSource(): Promise<DataSource> {
  const [
    { openDeviceDatabase },
    { createDeviceFileStore },
    { createCanvasImages },
    { createLocalDataSource, openLocalDatabase },
  ] = await Promise.all([
    import('@/lib/native-sqlite'),
    import('@/lib/native-storage'),
    import('@/lib/data-source/local/canvas-images'),
    import('@/lib/data-source/local'),
  ]);
  return createLocalDataSource(await openLocalDatabase(await openDeviceDatabase()), {
    files: createDeviceFileStore(),
    images: createCanvasImages(),
  });
}

/**
 * Installs the local `DataSource` (opening the device database the first time). Idempotent. An activation
 * dropped by `forgetLocalDataSource()` while it was opening never installs its `DataSource`.
 */
export async function activateLocalDataSource(): Promise<void> {
  if (!local) {
    const opening: Promise<DataSource> = openLocalDataSource().catch((error: unknown) => {
      if (local === opening) local = null;
      throw error;
    });
    local = opening;
  }
  const pending = local;
  const next = await pending;
  if (local === pending) setDataSource(next);
}

/** Tests only: forgets the opened local database, as a new app run would. */
export function forgetLocalDataSource(): void {
  local = null;
}

/** «En este teléfono»: stores the local mode and opens the dashboard, which installs the local `DataSource`. */
export function useEnterLocalMode() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    setLocalMode(true);
    queryClient.clear();
    await navigate({ to: '/' });
  };
}

/**
 * «Cambiar de modo»: back to the HTTP `DataSource` and the welcome screen, with an empty query cache so
 * nothing local is shown in the other mode. The local database is kept, data included.
 */
export function useLeaveLocalMode() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    setLocalMode(false);
    setDataSource(httpDataSource);
    queryClient.clear();
    await navigate({ to: '/welcome' });
  };
}
