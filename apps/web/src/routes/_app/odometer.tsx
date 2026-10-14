import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { vehicleTitle } from '@/features/vehicles/display';
import { Plate, VehiclePhoto } from '@/features/vehicles/dossier';
import { OdometerForm } from '@/features/vehicles/odometer-form';
import { vehiclesQuery } from '@/features/vehicles/queries';

/** Weekly mileage check-in: one quick form per active vehicle. The odometer reminder links here. */
export const Route = createFileRoute('/_app/odometer')({
  loader: ({ context }) => context.queryClient.ensureQueryData(vehiclesQuery('active')),
  component: OdometerPage,
});

function OdometerPage() {
  const { t } = useTranslation();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery('active'));

  return (
    <div className="reveal mx-auto grid w-full max-w-2xl gap-8">
      <PageHeader
        eyebrow={t('odometer.eyebrow')}
        title={t('odometer.pageTitle')}
        description={t('odometer.pageDescription')}
      />
      {vehicles.length === 0 ? (
        <Card className="grid justify-items-start gap-3 p-8">
          <p className="text-muted-foreground">{t('vehicles.empty.active')}</p>
          <Link to="/vehicles/new" className="font-semibold underline-offset-4 hover:underline">
            {t('vehicles.add')}
          </Link>
        </Card>
      ) : (
        vehicles.map((vehicle) => (
          <Card key={vehicle.id} className="grid gap-5 p-5 sm:p-7">
            <div className="flex items-center gap-4">
              <VehiclePhoto vehicle={vehicle} className="size-14 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <Link
                  to="/vehicles/$vehicleId"
                  params={{ vehicleId: vehicle.id }}
                  className="block truncate font-display text-lg font-bold tracking-[-0.02em] hover:underline"
                >
                  {vehicleTitle(vehicle)}
                </Link>
              </div>
              {vehicle.plate && <Plate className="text-sm">{vehicle.plate}</Plate>}
            </div>
            <OdometerForm vehicle={vehicle} />
          </Card>
        ))
      )}
    </div>
  );
}
