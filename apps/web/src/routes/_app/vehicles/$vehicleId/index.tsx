import { averageDistancePerYear } from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FuelLogsSection } from '@/features/fuel/fuel-logs-section';
import { fuelLogsQuery } from '@/features/fuel/queries';
import { MaintenanceSpendingMetric } from '@/features/maintenance/maintenance-spending';
import { MaintenanceSection } from '@/features/maintenance/maintenance-timeline';
import { maintenanceQuery, maintenanceSpendingQuery } from '@/features/maintenance/queries';
import { schedulesQuery } from '@/features/schedules/queries';
import { SchedulesSection } from '@/features/schedules/schedules-section';
import { vehicleFullName, vehicleTitle } from '@/features/vehicles/display';
import { Metric, Plate, VehiclePhoto, VehicleStatusBadge } from '@/features/vehicles/dossier';
import { OdometerForm } from '@/features/vehicles/odometer-form';
import { OdometerTimeline } from '@/features/vehicles/odometer-timeline';
import { odometerQuery, vehicleQuery } from '@/features/vehicles/queries';
import { VehicleActions } from '@/features/vehicles/vehicle-actions';
import { ApiError } from '@/lib/api-client';
import { useFormat } from '@/lib/format';

export const Route = createFileRoute('/_app/vehicles/$vehicleId/')({
  loader: async ({ context: { queryClient }, params: { vehicleId } }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData(vehicleQuery(vehicleId)),
        queryClient.ensureQueryData(odometerQuery(vehicleId)),
        queryClient.ensureQueryData(maintenanceQuery(vehicleId)),
        queryClient.ensureQueryData(maintenanceSpendingQuery(vehicleId)),
        queryClient.ensureQueryData(schedulesQuery(vehicleId)),
        queryClient.ensureQueryData(fuelLogsQuery(vehicleId)),
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.problem.status === 404) throw notFound();
      throw error;
    }
  },
  component: VehiclePage,
  notFoundComponent: VehicleNotFound,
});

function VehiclePage() {
  const { t } = useTranslation();
  const format = useFormat();
  const { vehicleId } = Route.useParams();
  const { data: vehicle } = useSuspenseQuery(vehicleQuery(vehicleId));
  const { data: readings } = useSuspenseQuery(odometerQuery(vehicleId));
  const perYear = averageDistancePerYear(readings);
  const meta = [
    vehicle.name ? vehicleFullName(vehicle) : vehicle.version,
    vehicle.year,
    t(`vehicles.fuels.${vehicle.fuelType}`),
  ].filter(Boolean);

  return (
    <div className="reveal grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/vehicles">
            <ArrowLeft aria-hidden />
            {t('vehicles.title')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/vehicles/$vehicleId/edit" params={{ vehicleId }}>
            <Pencil aria-hidden />
            {t('common.edit')}
          </Link>
        </Button>
      </div>

      <section className="dossier-paper grid gap-6 rounded-xl border p-5 shadow-soft sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <span className="font-display text-xl font-bold tracking-[-0.03em]">{t('vehicles.dossier')}</span>
          {vehicle.plate && <Plate>{vehicle.plate}</Plate>}
        </div>
        <div className="grid gap-6 md:grid-cols-[minmax(0,16rem)_1fr]">
          <VehiclePhoto vehicle={vehicle} className="aspect-[4/3] w-full rounded-lg border" />
          <div className="grid content-start gap-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1.5">
                <h1 className="text-3xl leading-[1.1] font-bold tracking-[-0.04em] sm:text-4xl">
                  {vehicleTitle(vehicle)}
                </h1>
                <p className="text-muted-foreground">{meta.join(' · ')}</p>
              </div>
              <VehicleStatusBadge vehicle={vehicle} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label={t('vehicles.metrics.odometer')}
                value={vehicle.odometer ? format.distance(vehicle.odometer.value) : '—'}
                hint={vehicle.odometer && format.date(vehicle.odometer.date)}
              />
              <Metric
                label={t('vehicles.metrics.perYear')}
                value={perYear === null ? '—' : format.distance(perYear)}
                hint={perYear === null ? t('vehicles.metrics.perYearPending') : undefined}
              />
              <Metric
                label={t('vehicles.metrics.sincePurchase')}
                value={
                  vehicle.odometer && vehicle.purchaseOdometer !== null
                    ? format.distance(vehicle.odometer.value - vehicle.purchaseOdometer)
                    : '—'
                }
                hint={vehicle.purchaseDate && format.date(vehicle.purchaseDate)}
              />
              <MaintenanceSpendingMetric vehicleId={vehicleId} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('odometer.title')}</CardTitle>
            <CardDescription>{t('odometer.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {vehicle.status === 'active' && <OdometerForm vehicle={vehicle} />}
            <div>
              <span className="label-caps">{t('odometer.history')}</span>
              <OdometerTimeline vehicleId={vehicleId} readings={readings} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('vehicles.details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label={t('vehicles.fields.type')}>{t(`vehicles.types.${vehicle.type}`)}</Detail>
              <Detail label={t('vehicles.fields.fuelType')}>{t(`vehicles.fuels.${vehicle.fuelType}`)}</Detail>
              <Detail label={t('vehicles.fields.vin')}>
                {vehicle.vin && <span className="font-mono text-sm tracking-wide">{vehicle.vin}</span>}
              </Detail>
              <Detail label={t('vehicles.fields.purchaseDate')}>
                {vehicle.purchaseDate && format.date(vehicle.purchaseDate)}
              </Detail>
              <Detail label={t('vehicles.fields.purchasePrice')}>
                {vehicle.purchasePrice !== null && format.money(vehicle.purchasePrice)}
              </Detail>
              <Detail label={t('vehicles.fields.purchaseOdometer', { unit: format.distanceUnit })}>
                {vehicle.purchaseOdometer !== null && format.distance(vehicle.purchaseOdometer)}
              </Detail>
              {vehicle.notes && (
                <div className="sm:col-span-2">
                  <Detail label={t('vehicles.fields.notes')}>
                    <span className="whitespace-pre-line">{vehicle.notes}</span>
                  </Detail>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      <FuelLogsSection vehicle={vehicle} />

      <SchedulesSection vehicle={vehicle} />

      <MaintenanceSection vehicle={vehicle} />

      <Card>
        <CardHeader>
          <CardTitle>{t('vehicles.manage')}</CardTitle>
          <CardDescription>{t('vehicles.manageDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <VehicleActions vehicle={vehicle} />
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="label-caps">{label}</dt>
      <dd className="font-medium">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function VehicleNotFound() {
  const { t } = useTranslation();
  return (
    <Card className="reveal grid justify-items-start gap-4 p-8">
      <h1 className="text-2xl font-bold tracking-[-0.03em]">{t('vehicles.notFound')}</h1>
      <Button asChild variant="outline">
        <Link to="/vehicles">{t('vehicles.backToList')}</Link>
      </Button>
    </Card>
  );
}
