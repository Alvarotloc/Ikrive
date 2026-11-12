import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { vehicleTitle } from '@/features/vehicles/display';
import { PhotoPicker } from '@/features/vehicles/photo-picker';
import { useUpdateVehicle, vehicleQuery } from '@/features/vehicles/queries';
import { VehicleForm } from '@/features/vehicles/vehicle-form';
import { isLocalMode } from '@/lib/app-mode';

export const Route = createFileRoute('/_app/vehicles/$vehicleId/edit')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(vehicleQuery(params.vehicleId)),
  component: EditVehiclePage,
});

function EditVehiclePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { vehicleId } = Route.useParams();
  const { data: vehicle } = useSuspenseQuery(vehicleQuery(vehicleId));
  const update = useUpdateVehicle(vehicleId);
  const backToFile = () => navigate({ to: '/vehicles/$vehicleId', params: { vehicleId } });

  return (
    <div className="reveal mx-auto grid w-full max-w-3xl gap-8">
      <PageHeader eyebrow={vehicleTitle(vehicle)} title={t('vehicles.editTitle')} />
      {/* Photos are not stored on the phone until #65. */}
      {!isLocalMode() && (
        <div className="max-w-sm">
          <PhotoPicker vehicle={vehicle} />
        </div>
      )}
      <VehicleForm
        vehicle={vehicle}
        onCancel={backToFile}
        onSubmit={async ({ currentOdometer: _, ...changes }) => {
          await update.mutateAsync(changes);
          toast.success(t('vehicles.updated'));
          await backToFile();
        }}
      />
    </div>
  );
}
