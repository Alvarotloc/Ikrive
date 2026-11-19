import type { Vehicle } from '@ikrive/shared';
import { ImagePlus, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CameraCaptureButton } from '@/components/camera-capture-button';
import { Button } from '@/components/ui/button';
import { useRestoredCapture } from '@/features/mobile/camera-restore';
import { ApiError } from '@/lib/api-client';
import { useCanCapture } from '@/lib/use-can-capture';
import { VehiclePhoto } from './dossier';
import { useRemoveVehiclePhoto, useUploadVehiclePhoto } from './queries';

/**
 * Vehicle photo with upload and remove buttons. The `DataSource` (the API, or the phone in local mode)
 * orients, resizes and recodes it, which strips its metadata. On a touch device it also offers «Take photo»,
 * which goes through the same upload, and the file button becomes «Choose from gallery». A camera photo
 * recovered after Android killed the app (`camera-restore`) goes through that upload too.
 */
export function PhotoPicker({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadVehiclePhoto(vehicle.id);
  const remove = useRemoveVehiclePhoto(vehicle.id);
  const busy = upload.isPending || remove.isPending;
  const canCapture = useCanCapture();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success(t('vehicles.photo.saved'));
    } catch (cause) {
      toast.error(
        cause instanceof ApiError && cause.problem.status < 500
          ? t('vehicles.photo.invalid')
          : t('common.error'),
      );
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  useRestoredCapture(
    (target) => target.kind === 'vehicle-photo' && target.vehicleId === vehicle.id,
    (capture) => void onFile(capture.file),
  );

  return (
    <div className="relative overflow-hidden rounded-lg border">
      <VehiclePhoto vehicle={vehicle} className="aspect-[4/3] w-full" />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-2 bg-linear-to-t from-black/45 to-transparent p-3">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('vehicles.photo.fileInput')}
          onChange={(event) => onFile(event.target.files?.[0])}
        />
        {vehicle.photoUrl && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => remove.mutate()}
            aria-label={t('vehicles.photo.remove')}
          >
            <X aria-hidden />
          </Button>
        )}
        {canCapture && (
          <CameraCaptureButton
            inputLabel={t('camera.input')}
            size="sm"
            variant="outline"
            disabled={busy}
            onFile={onFile}
            restoreTarget={() => ({ kind: 'vehicle-photo', vehicleId: vehicle.id })}
          />
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus aria-hidden />
          {canCapture
            ? t('vehicles.photo.gallery')
            : vehicle.photoUrl
              ? t('vehicles.photo.change')
              : t('vehicles.photo.add')}
        </Button>
      </div>
    </div>
  );
}
