import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTarget } from '@/features/mobile/camera-restore';
import { setLocalMode } from '@/lib/app-mode';
import { renderWithProviders } from '@/test/render';
import { CameraCaptureButton } from './camera-capture-button';

/**
 * The native side: the camera permission and the pending capture. `loaded` turns true the first time the
 * module is imported (then it stays in the module cache: the web test goes first).
 */
const native = vi.hoisted(() => ({
  state: { loaded: false },
  isCameraGranted: vi.fn(async () => true),
  savePendingCapture: vi.fn(async (_json: string) => {}),
  clearPendingCapture: vi.fn(async () => {}),
}));
vi.mock('@/lib/native-camera', () => {
  native.state.loaded = true;
  return {
    isCameraGranted: native.isCameraGranted,
    savePendingCapture: native.savePendingCapture,
    clearPendingCapture: native.clearPendingCapture,
  };
});

const TARGET: CaptureTarget = { kind: 'invoice', vehicleId: 'v1', recordId: 'r1' };
const OPENED_AT = Date.UTC(2026, 10, 19, 10, 15, 30, 500);

const photo = () => new File([new Uint8Array(10)], 'JPEG_20261119_101530_1.jpg', { type: 'image/jpeg' });

/** The button with a target, and a spy on the hidden input's `click` (opening the camera). */
function setup() {
  const onFile = vi.fn();
  const openCamera = vi.spyOn(HTMLInputElement.prototype, 'click');
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <CameraCaptureButton inputLabel="Cámara" onFile={onFile} restoreTarget={() => TARGET} />
    </>,
  );
  return { onFile, openCamera, ...rendered };
}

const button = () => screen.getByRole('button', { name: 'Hacer foto' });
const cameraInput = () => screen.getByLabelText('Cámara');

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  native.isCameraGranted.mockReset();
  native.isCameraGranted.mockResolvedValue(true);
  native.savePendingCapture.mockReset();
  native.savePendingCapture.mockResolvedValue(undefined);
  native.clearPendingCapture.mockReset();
  native.clearPendingCapture.mockResolvedValue(undefined);
});

describe('CameraCaptureButton', () => {
  // First: once a test imports the module, it stays in the module cache.
  it('web: opens the camera without saving anything nor loading native code', async () => {
    const { user, openCamera, onFile } = setup();

    await user.click(button());
    expect(openCamera).toHaveBeenCalledTimes(1);
    await user.upload(cameraInput(), photo());
    fireEvent(cameraInput(), new Event('cancel'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(native.state.loaded).toBe(false);
    expect(native.savePendingCapture).not.toHaveBeenCalled();
    expect(native.clearPendingCapture).not.toHaveBeenCalled();
  });

  it('native: saves the capture target before opening the camera', async () => {
    vi.stubEnv('MODE', 'native');
    vi.useFakeTimers({ toFake: ['Date'], now: OPENED_AT });
    setLocalMode(true);
    const { user, openCamera } = setup();
    // The moment the camera opens, for the order of the two.
    let cameraOpenedAt = 0;
    openCamera.mockImplementation(() => {
      cameraOpenedAt = Date.now();
    });

    await user.click(button());
    vi.setSystemTime(OPENED_AT + 1000);

    await waitFor(() => expect(native.savePendingCapture).toHaveBeenCalledTimes(1));
    const [json = ''] = native.savePendingCapture.mock.calls[0] ?? [];
    const saved = JSON.parse(json);
    expect(saved).toEqual({ target: TARGET, mode: 'local', openedAt: OPENED_AT });
    expect(saved.openedAt).toBeLessThanOrEqual(cameraOpenedAt);
    expect(openCamera).toHaveBeenCalledTimes(1);
  });

  it('native: opens the camera synchronously in the same click, without waiting for the capture to be saved', async () => {
    vi.stubEnv('MODE', 'native');
    let saved: () => void = () => {};
    native.savePendingCapture.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          saved = resolve;
        }),
    );
    const { openCamera } = setup();

    // A plain click, without awaiting anything: the input must be clicked within the handler.
    fireEvent.click(button());

    expect(openCamera).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(native.savePendingCapture).toHaveBeenCalledTimes(1));
    // Still writing; the camera is already open.
    saved();
  });

  it('native: forgets the capture when the photo arrives', async () => {
    vi.stubEnv('MODE', 'native');
    const { user, onFile } = setup();

    await user.click(button());
    await user.upload(cameraInput(), photo());

    expect(onFile).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: photo().name }));
    await waitFor(() => expect(native.clearPendingCapture).toHaveBeenCalledTimes(1));
    // Removed after it was written, never before.
    expect(native.savePendingCapture.mock.invocationCallOrder[0]).toBeLessThan(
      native.clearPendingCapture.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('native: forgets the capture when the camera is cancelled', async () => {
    vi.stubEnv('MODE', 'native');
    native.isCameraGranted.mockResolvedValue(false);
    const { user } = setup();

    await user.click(button());
    fireEvent(cameraInput(), new Event('cancel'));

    await waitFor(() => expect(native.clearPendingCapture).toHaveBeenCalledTimes(1));
    expect(native.savePendingCapture.mock.invocationCallOrder[0]).toBeLessThan(
      native.clearPendingCapture.mock.invocationCallOrder[0] ?? 0,
    );
    // The permission warning is unchanged.
    expect(await screen.findByText(/Ikrive no tiene permiso para usar la cámara/)).toBeInTheDocument();
  });

  it('native: opens the camera even if the capture cannot be saved', async () => {
    vi.stubEnv('MODE', 'native');
    native.savePendingCapture.mockRejectedValue(new Error('No space left on device'));
    const { user, openCamera, onFile } = setup();

    await user.click(button());
    await waitFor(() => expect(native.savePendingCapture).toHaveBeenCalledTimes(1));
    await user.upload(cameraInput(), photo());

    expect(openCamera).toHaveBeenCalled();
    expect(onFile).toHaveBeenCalledTimes(1);
    // The failed write does not hold the next change back.
    await waitFor(() => expect(native.clearPendingCapture).toHaveBeenCalledTimes(1));
  });
});
