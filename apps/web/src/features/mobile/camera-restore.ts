import { MAINTENANCE_CATEGORIES } from '@ikrive/shared';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import type { MaintenanceFormInput } from '@/features/maintenance/form';
import { isLocalMode } from '@/lib/app-mode';
import { isNativeApp } from '@/lib/platform';

/**
 * Recovery of a camera photo after Android kills the native app while the camera is open (#81). «Take photo»
 * writes a pending capture (`lib/native-camera`, in `Directory.Data`) saying where the photo goes; the photo
 * and the cancel remove it. If the process dies, the photo is still in `Pictures` and the next run
 * (`CameraRestoreHandler`) reads it and hands it to the screen it was for through `offerRestoredCapture`.
 * On the web (and the PWA) nothing here writes, reads or loads native code.
 */

/** Where the photo goes: the vehicle photo, the invoices of a record, or the create form of a record. */
export type CaptureTarget =
  | { kind: 'vehicle-photo'; vehicleId: string }
  | { kind: 'invoice'; vehicleId: string; recordId: string }
  | {
      kind: 'invoice-draft';
      vehicleId: string;
      /** The values of the create form when the camera opened. */
      draft: MaintenanceFormInput;
      /** How many invoices were already chosen in the form (they live only in memory and are lost). */
      pendingCount: number;
    };

export interface PendingCapture {
  target: CaptureTarget;
  /** The mode the photo was taken in: it is only delivered in that same mode. */
  mode: 'server' | 'local';
  /** When «Take photo» opened the camera (epoch ms). */
  openedAt: number;
}

/** The text values of the create form, as `form.getValues()` returns them. */
const draftSchema = z.object({
  date: z.string(),
  odometer: z.string(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  title: z.string(),
  description: z.string().nullable().optional(),
  workshop: z.string().nullable().optional(),
  cost: z.string(),
  includeInReport: z.boolean(),
  scheduleId: z.string(),
}) satisfies z.ZodType<MaintenanceFormInput>;

const id = z.string().min(1);

export const pendingCaptureSchema: z.ZodType<PendingCapture> = z.object({
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('vehicle-photo'), vehicleId: id }),
    z.object({ kind: z.literal('invoice'), vehicleId: id, recordId: id }),
    z.object({
      kind: z.literal('invoice-draft'),
      vehicleId: id,
      draft: draftSchema,
      pendingCount: z.number().int().nonnegative(),
    }),
  ]),
  mode: z.enum(['server', 'local']),
  openedAt: z.number().int().positive(),
});

/** The pending capture in `json`, or `null` if it is not one. */
export function parsePendingCapture(json: string): PendingCapture | null {
  try {
    const parsed = pendingCaptureSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The mode the app runs in now, as a pending capture records it. */
export const currentCaptureMode = (): PendingCapture['mode'] => (isLocalMode() ? 'local' : 'server');

/**
 * The last write or removal of the pending capture: each one waits for the previous, so a removal never
 * lands before the write it undoes (a camera cancelled at once).
 */
let lastChange: Promise<void> = Promise.resolve();

/** Runs `change` after the previous change of the pending capture; never rejects. */
function queueChange(change: (native: typeof import('@/lib/native-camera')) => Promise<void>): Promise<void> {
  lastChange = lastChange.then(async () => {
    try {
      await change(await import('@/lib/native-camera'));
    } catch {
      // Nothing to tell the user: see the callers.
    }
  });
  return lastChange;
}

/**
 * Native app only: writes the pending capture for `target`, opened now. Never rejects: if it cannot be
 * written the camera opens anyway and the photo simply cannot be recovered. The caller does not wait for it
 * (the camera must open in the same click).
 */
export function rememberCapture(target: CaptureTarget): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  // Taken now: the photo cannot be older than this.
  const capture: PendingCapture = { target, mode: currentCaptureMode(), openedAt: Date.now() };
  return queueChange((native) => native.savePendingCapture(JSON.stringify(capture)));
}

/**
 * Native app only: removes the pending capture, as the photo (or the cancel) arrived. Never rejects; if it
 * cannot be removed, the next run finds no photo for it, warns and removes it.
 */
export function forgetCapture(): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  return queueChange((native) => native.clearPendingCapture());
}

/**
 * When the camera of a valid pending capture opened (epoch ms), or `null`: the start-up clean-up keeps the
 * photos from then on. Native app only; never rejects.
 */
export async function pendingCaptureCutoff(): Promise<number | null> {
  if (!isNativeApp()) return null;
  try {
    const native = await import('@/lib/native-camera');
    const json = await native.readPendingCapture();
    return json === null ? null : (parsePendingCapture(json)?.openedAt ?? null);
  } catch {
    return null;
  }
}

export interface RestoredCapture {
  target: CaptureTarget;
  file: File;
}

/** The recovered photo waiting for its screen, and the screens waiting for one. */
let offered: RestoredCapture | null = null;
const listeners = new Set<() => void>();
/** Whether this app run already looked for a pending capture. */
let restoreRunClaimed = false;

/** Hands `capture` to the screen of its target, now if it is mounted or as soon as it mounts. */
export function offerRestoredCapture(capture: RestoredCapture): void {
  offered = capture;
  for (const listener of listeners) listener();
}

/**
 * Calls `consume` once when there is a recovered photo whose target passes `match`, and takes it out of
 * the store, so no other screen (nor a second mount) gets it again.
 */
export function useRestoredCapture(
  match: (target: CaptureTarget) => boolean,
  consume: (capture: RestoredCapture) => void,
): void {
  const latest = useRef({ match, consume });
  latest.current = { match, consume };

  useEffect(() => {
    const check = () => {
      const capture = offered;
      if (!capture || !latest.current.match(capture.target)) return;
      offered = null;
      latest.current.consume(capture);
    };
    listeners.add(check);
    check();
    return () => {
      listeners.delete(check);
    };
  }, []);
}

/** `true` the first time it is called in this app run, `false` afterwards: the recovery runs once. */
export function claimRestoreRun(): boolean {
  if (restoreRunClaimed) return false;
  restoreRunClaimed = true;
  return true;
}

/** A new app run (or the next test): the recovery may run again and no photo is waiting. */
export function forgetRestoreRun(): void {
  restoreRunClaimed = false;
  offered = null;
}
