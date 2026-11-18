import { Camera } from 'lucide-react';
import { type ComponentProps, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isNativeApp } from '@/lib/platform';

type ButtonProps = ComponentProps<typeof Button>;

interface CameraCaptureButtonProps {
  /** `aria-label` of the hidden camera input (screen readers and tests). */
  inputLabel: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}

/**
 * «Take photo»: a button that opens a hidden camera input (`capture="environment"`, one image). It validates
 * nothing; whoever receives `onFile` does, exactly as for a chosen file.
 *
 * In the native app Capacitor asks for the CAMERA permission when the input opens the camera; if it is
 * denied, the input only gets `cancel`, like a camera closed without a photo. Capacitor only opens the camera
 * with the permission granted, so `cancel` without it means there was no camera: warn where to turn it on.
 */
export function CameraCaptureButton({
  inputLabel,
  onFile,
  disabled,
  size,
  variant,
}: CameraCaptureButtonProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    // Subscribed by hand: React does not guarantee `onCancel` on an <input>.
    const onCancel = async () => {
      if (!isNativeApp()) return;
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
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Camera aria-hidden />
        {t('camera.take')}
      </Button>
    </>
  );
}
