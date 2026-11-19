import { Camera } from 'lucide-react';
import { type ComponentProps, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { type CaptureTarget, forgetCapture, rememberCapture } from '@/features/mobile/camera-restore';
import { isNativeApp } from '@/lib/platform';

type ButtonProps = ComponentProps<typeof Button>;

interface CameraCaptureButtonProps {
  /** `aria-label` of the hidden camera input (screen readers and tests). */
  inputLabel: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  /**
   * Where the photo goes, read when the button is pressed. In the native app it is written down before the
   * camera opens, so the photo can still reach it if Android kills the app meanwhile (`camera-restore`).
   */
  restoreTarget?: () => CaptureTarget;
}

/**
 * «Take photo»: a button that opens a hidden camera input (`capture="environment"`, one image). It validates
 * nothing; whoever receives `onFile` does, exactly as for a chosen file.
 *
 * In the native app Capacitor asks for the CAMERA permission when the input opens the camera; if it is
 * denied, the input only gets `cancel`, like a camera closed without a photo. Capacitor only opens the camera
 * with the permission granted, so `cancel` without it means there was no camera: warn where to turn it on.
 *
 * With `restoreTarget`, the native app also writes the pending capture as the camera opens (without waiting:
 * the input must be clicked in the same gesture) and removes it on `change` and `cancel`.
 */
export function CameraCaptureButton({
  inputLabel,
  onFile,
  disabled,
  size,
  variant,
  restoreTarget,
}: CameraCaptureButtonProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    // Subscribed by hand: React does not guarantee `onCancel` on an <input>.
    const onCancel = async () => {
      if (!isNativeApp()) return;
      void forgetCapture();
      try {
        const { isCameraGranted } = await import('@/lib/native-camera');
        if (!(await isCameraGranted())) toast.error(t('camera.denied'));
      } catch {
        // The plugin is missing or failed: there is nothing to tell the user.
      }
    };
    element.addEventListener('cancel', onCancel);
    return () => element.removeEventListener('cancel', onCancel);
  }, [t]);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={inputLabel}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so taking another photo fires `change` again.
          event.target.value = '';
          if (isNativeApp()) void forgetCapture();
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => {
          // Not awaited (it never rejects): the camera opens in this same click, or the WebView refuses to.
          if (isNativeApp() && restoreTarget) void rememberCapture(restoreTarget());
          input.current?.click();
        }}
      >
        <Camera aria-hidden />
        {t('camera.take')}
      </Button>
    </>
  );
}
