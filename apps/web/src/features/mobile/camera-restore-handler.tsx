import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { maintenanceQuery } from '@/features/maintenance/queries';
import { vehicleQuery } from '@/features/vehicles/queries';
import {
  type CaptureTarget,
  claimRestoreRun,
  currentCaptureMode,
  offerRestoredCapture,
  parsePendingCapture,
} from './camera-restore';

type Navigate = ReturnType<typeof useNavigate>;

/** Whether the vehicle (and, for an invoice, its maintenance record) of `target` still exists. */
async function targetExists(queryClient: QueryClient, target: CaptureTarget): Promise<boolean> {
  try {
    await queryClient.fetchQuery(vehicleQuery(target.vehicleId));
    if (target.kind !== 'invoice') return true;
    const records = await queryClient.fetchQuery(maintenanceQuery(target.vehicleId));
    return records.some((record) => record.id === target.recordId);
  } catch {
    return false;
  }
}

/** Opens the screen of `target`: the vehicle edit page for its photo, the vehicle page for an invoice. */
function openTarget(navigate: Navigate, target: CaptureTarget) {
  const params = { vehicleId: target.vehicleId };
  return target.kind === 'vehicle-photo'
    ? navigate({ to: '/vehicles/$vehicleId/edit', params })
    : navigate({ to: '/vehicles/$vehicleId', params });
}

/**
 * Looks for a pending capture and, if there is one, delivers its photo (`offerRestoredCapture`) and opens
 * its screen. Resolves to `false` when there was a pending capture whose photo cannot be delivered. The
 * pending capture is removed whatever happens.
 */
async function restorePendingCapture(queryClient: QueryClient, navigate: Navigate): Promise<boolean> {
  const native = await import('@/lib/native-camera');
  const json = await native.readPendingCapture();
  if (json === null) return true;
  try {
    const capture = parsePendingCapture(json);
    if (!capture || capture.mode !== currentCaptureMode()) return false;
    if (!(await targetExists(queryClient, capture.target))) return false;
    const file = await native.readCameraPhotoSince(capture.openedAt).catch(() => null);
    if (!file) return false;
    offerRestoredCapture({ target: capture.target, file });
    await openTarget(navigate, capture.target);
    return true;
  } finally {
    await native.clearPendingCapture().catch(() => {
      // Left behind: the next run finds no photo for it (this one is swept), warns and tries again.
    });
  }
}

/**
 * Native app only (mounted by the authenticated layout): the first time in an app run, recovers the camera
 * photo of a pending capture, left when Android killed the app while the camera was open (`camera-restore`).
 * The photo goes to the screen it was taken for, which uploads it as a photo just taken; if it cannot,
 * a toast says so and nothing opens. Same in server and local mode. Renders nothing.
 */
export function CameraRestoreHandler() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    // Once per run: StrictMode mounts twice and the layout remounts after logging out and in.
    if (!claimRestoreRun()) return;
    restorePendingCapture(queryClient, navigate)
      .then((restored) => {
        if (!restored) toast.error(t('camera.restoreFailed'));
      })
      .catch(() => {
        // The plugin failed before any pending capture was read: there is nothing to tell.
      });
  }, [queryClient, navigate, t]);

  return null;
}
