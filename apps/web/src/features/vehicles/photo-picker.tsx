import type { Vehicle } from '@ikrive/shared';
import { ImagePlus, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { VehiclePhoto } from './dossier';
import { useRemoveVehiclePhoto, useUploadVehiclePhoto } from './queries';

/** Vehicle photo with upload and remove buttons. The API resizes it and strips its metadata. */
export function PhotoPicker({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadVehiclePhoto(vehicle.id);
  const remove = useRemoveVehiclePhoto(vehicle.id);
  const busy = upload.isPending || remove.isPending;

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

  return (
    <div className="relative overflow-hidden rounded-lg border">
      <VehiclePhoto vehicle={vehicle} className="aspect-[4/3] w-full" />
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-linear-to-t from-black/45 to-transparent p-3">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
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
        <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus aria-hidden />
          {vehicle.photoUrl ? t('vehicles.photo.change') : t('vehicles.photo.add')}
        </Button>
      </div>
    </div>
  );
}
