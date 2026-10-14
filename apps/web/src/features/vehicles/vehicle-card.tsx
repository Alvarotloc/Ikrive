import type { Vehicle } from '@ikrive/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { vehicleFullName, vehicleTitle } from './display';
import { Plate, VehiclePhoto, VehicleStatusBadge } from './dossier';

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const format = useFormat();

  return (
    <Link
      to="/vehicles/$vehicleId"
      params={{ vehicleId: vehicle.id }}
      className="group grid overflow-hidden rounded-xl border bg-card transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
    >
      <VehiclePhoto vehicle={vehicle} className="aspect-[16/9] w-full" />
      <div className="grid gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-[-0.03em]">{vehicleTitle(vehicle)}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {[vehicle.name ? vehicleFullName(vehicle) : vehicle.version, vehicle.year]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {vehicle.plate && <Plate className="text-sm">{vehicle.plate}</Plate>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <span className="font-display text-lg font-semibold tracking-[-0.02em]">
            {vehicle.odometer ? format.distance(vehicle.odometer.value) : t('vehicles.noOdometer')}
          </span>
          {vehicle.status !== 'active' && <VehicleStatusBadge vehicle={vehicle} />}
        </div>
      </div>
    </Link>
  );
}
