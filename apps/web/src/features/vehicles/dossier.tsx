import type { Vehicle } from '@ikrive/shared';
import { Car, Motorbike, Truck, Van } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Number plate chip, as in the "Expediente del vehículo" mockup of the landing. */
export function Plate({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  /** Full plate as a tooltip, for the places where the chip may be truncated. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-md border bg-card/75 px-3 py-1.5 font-display font-bold tracking-[0.12em] whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card/70 p-4">
      <span className="label-caps block">{label}</span>
      <strong className="mt-2 block font-display text-2xl tracking-[-0.04em]">{value}</strong>
      {hint && <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function VehicleStatusBadge({ vehicle }: { vehicle: Pick<Vehicle, 'status' | 'soldAt'> }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (vehicle.status === 'active') return <Badge variant="status">{t('vehicles.status.active')}</Badge>;
  if (vehicle.status === 'sold' && vehicle.soldAt) {
    return (
      <Badge variant="stamp">{t('vehicles.status.soldOn', { date: format.date(vehicle.soldAt) })}</Badge>
    );
  }
  return <Badge variant="stamp">{t(`vehicles.status.${vehicle.status}`)}</Badge>;
}

const typeIcons = { car: Car, motorcycle: Motorbike, van: Van, truck: Truck, other: Car } as const;

/** Vehicle photo, or a mint placeholder with the vehicle type icon. */
export function VehiclePhoto({
  vehicle,
  className,
}: {
  vehicle: Pick<Vehicle, 'photoUrl' | 'type'>;
  className?: string;
}) {
  const Icon = typeIcons[vehicle.type];
  if (vehicle.photoUrl) {
    return <img src={vehicle.photoUrl} alt="" className={cn('object-cover', className)} loading="lazy" />;
  }
  return (
    <div className={cn('grid place-items-center bg-accent text-accent-foreground', className)}>
      <Icon className="size-1/4 max-h-12 max-w-12 opacity-80" strokeWidth={1.5} aria-hidden />
    </div>
  );
}
