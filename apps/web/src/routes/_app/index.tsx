import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Car, Gauge, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { vehiclesQuery } from '@/features/vehicles/queries';
import { VehicleCard } from '@/features/vehicles/vehicle-card';

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(vehiclesQuery('active')),
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation();
  const { me } = Route.useRouteContext();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery('active'));

  return (
    <div className="reveal grid gap-8">
      <PageHeader
        eyebrow={t('dashboard.eyebrow')}
        title={t('dashboard.welcome', { name: me.name })}
        actions={
          vehicles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="accent">
                <Link to="/odometer">
                  <Gauge aria-hidden />
                  {t('odometer.pageTitle')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/vehicles/new">
                  <Plus aria-hidden />
                  {t('vehicles.add')}
                </Link>
              </Button>
            </div>
          )
        }
      />
      {vehicles.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      ) : (
        <EmptyGarage />
      )}
    </div>
  );
}

function EmptyGarage() {
  const { t } = useTranslation();
  const steps = t('dashboard.steps', { returnObjects: true }) as { title: string; description: string }[];

  return (
    <Card className="grid gap-10 p-7 sm:p-10">
      <div className="flex flex-col items-start gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <Car className="size-6" aria-hidden />
        </span>
        <div className="grid gap-1.5">
          <h2 className="text-2xl font-bold tracking-[-0.03em]">{t('dashboard.emptyTitle')}</h2>
          <p className="text-muted-foreground">{t('dashboard.emptyDescription')}</p>
        </div>
        <Button asChild>
          <Link to="/vehicles/new">
            <Plus aria-hidden />
            {t('dashboard.addFirst')}
          </Link>
        </Button>
      </div>
      <ol className="grid gap-8 border-t pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="mb-4 grid size-8 place-items-center rounded-full bg-primary font-display text-xs font-semibold text-primary-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="leading-snug font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
