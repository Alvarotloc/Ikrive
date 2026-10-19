import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Metric } from '@/features/vehicles/dossier';
import { useFormat } from '@/lib/format';
import { maintenanceSpendingQuery } from './queries';

/** Dossier metric with the vehicle's accumulated maintenance cost. Zero is a known amount, not "—". */
export function MaintenanceSpendingMetric({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { data } = useSuspenseQuery(maintenanceSpendingQuery(vehicleId));
  return <Metric label={t('vehicles.metrics.maintenanceSpending')} value={format.money(data.total)} />;
}
