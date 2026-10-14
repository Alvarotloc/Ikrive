import { VEHICLE_STATUSES } from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { vehiclesQuery } from '@/features/vehicles/queries';
import { VehicleCard } from '@/features/vehicles/vehicle-card';

const FILTERS = [...VEHICLE_STATUSES, 'all'] as const;

export const Route = createFileRoute('/_app/vehicles/')({
  validateSearch: z.object({ status: z.enum(FILTERS).default('active').catch('active') }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(vehiclesQuery(deps.status)),
  component: VehiclesPage,
});

function VehiclesPage() {
  const { t } = useTranslation();
  const { status } = Route.useSearch();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery(status));

  return (
    <div className="reveal grid gap-8">
      <PageHeader
        eyebrow={t('vehicles.eyebrow')}
        title={t('vehicles.title')}
        actions={
          <Button asChild>
            <Link to="/vehicles/new">
              <Plus aria-hidden />
              {t('vehicles.add')}
            </Link>
          </Button>
        }
      />
      <nav className="flex flex-wrap gap-1" aria-label={t('vehicles.filterLabel')}>
        {FILTERS.map((filter) => (
          <Link
            key={filter}
            to="/vehicles"
            search={{ status: filter }}
            className="min-h-9 rounded-full border px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-transparent data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
            activeOptions={{ includeSearch: true }}
          >
            {t(`vehicles.filters.${filter}`)}
          </Link>
        ))}
      </nav>
      {vehicles.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-muted-foreground">{t(`vehicles.empty.${status}`)}</Card>
      )}
    </div>
  );
}
