import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { useCreateVehicle } from '@/features/vehicles/queries';
import { VehicleForm } from '@/features/vehicles/vehicle-form';

export const Route = createFileRoute('/_app/vehicles/new')({
  component: NewVehiclePage,
});

function NewVehiclePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateVehicle();

  return (
    <div className="reveal mx-auto grid w-full max-w-3xl gap-8">
      <PageHeader
        eyebrow={t('vehicles.eyebrow')}
        title={t('vehicles.newTitle')}
        description={t('vehicles.newDescription')}
      />
      <VehicleForm
        onCancel={() => navigate({ to: '/vehicles' })}
        onSubmit={async (values) => {
          const vehicle = await create.mutateAsync(values);
          toast.success(t('vehicles.created'));
          await navigate({ to: '/vehicles/$vehicleId', params: { vehicleId: vehicle.id } });
        }}
      />
    </div>
  );
}
