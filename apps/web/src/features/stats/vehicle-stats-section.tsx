import type { Vehicle } from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Metric } from '@/features/vehicles/dossier';
import { statsQuery } from './queries';
import { StatsCharts } from './stats-charts';
import { useStatsFormat } from './use-stats-format';

/** Key figures and charts over the vehicle's whole history. Missing data shows "—" and what is needed. */
export function VehicleStatsSection({ vehicle }: { vehicle: Pick<Vehicle, 'id' | 'fuelType'> }) {
  const { t } = useTranslation();
  const format = useStatsFormat(vehicle.fuelType);
  const { data: stats } = useSuspenseQuery(statsQuery(vehicle.id));
  const { distance, consumption, costPerDistance, spending } = stats;
  const unit = format.distanceUnit;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('stats.title')}</CardTitle>
        <CardDescription>{t('stats.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label={t('stats.metrics.perYear')}
            value={distance.perYear === null ? '—' : format.distance(distance.perYear)}
            hint={distance.perYear === null ? t('stats.pending.perYear') : undefined}
          />
          <Metric
            label={t('stats.metrics.consumption')}
            value={consumption.average === null ? '—' : format.consumption(consumption.average)}
            hint={consumption.average === null ? t('stats.pending.consumption') : undefined}
          />
          <Metric
            label={t('stats.metrics.fuelCostPerDistance', { unit })}
            value={costPerDistance.fuel === null ? '—' : format.costPerDistance(costPerDistance.fuel)}
            hint={costPerDistance.fuel === null ? t('stats.pending.costPerDistance') : undefined}
          />
          <Metric
            label={t('stats.metrics.maintenanceCostPerDistance', { unit })}
            value={
              costPerDistance.maintenance === null ? '—' : format.costPerDistance(costPerDistance.maintenance)
            }
            hint={costPerDistance.maintenance === null ? t('stats.pending.costPerDistance') : undefined}
          />
          <Metric
            label={t('stats.metrics.totalCost')}
            value={format.money(spending.total)}
            hint={t('stats.metrics.totalCostHint', {
              context: spending.purchase === null ? 'noPurchase' : undefined,
              purchase: spending.purchase === null ? undefined : format.money(spending.purchase),
              fuel: format.money(spending.fuel),
              maintenance: format.money(spending.maintenance),
            })}
          />
        </div>
        <StatsCharts stats={stats} fuelType={vehicle.fuelType} />
      </CardContent>
    </Card>
  );
}
