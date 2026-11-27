import type { OdometerReading } from '@ikrive/shared';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { badgeListClassName, badgeListRowClassName } from '@/components/ui/badge-list';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDeleteOdometerReading } from './queries';

const VISIBLE_READINGS = 8;

/** Latest odometer readings, styled like the "Últimos registros" timeline of the landing. */
export function OdometerTimeline({
  vehicleId,
  readings,
}: {
  vehicleId: string;
  readings: OdometerReading[];
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const remove = useDeleteOdometerReading(vehicleId);

  if (readings.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{t('odometer.empty')}</p>;
  }

  return (
    <ol className={cn('divide-y', badgeListClassName)}>
      {readings.slice(0, VISIBLE_READINGS).map((reading, index) => {
        const previous = readings[index + 1];
        return (
          <li
            key={reading.id}
            className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3', badgeListRowClassName)}
          >
            <Badge variant="stamp" className="min-w-20 justify-center uppercase">
              {t(`odometer.sources.${reading.source}`)}
            </Badge>
            <div className="min-w-0">
              <strong className="block font-semibold">{format.distance(reading.value)}</strong>
              <span className="text-sm text-muted-foreground">
                {format.date(reading.date)}
                {previous && ` · +${format.distance(reading.value - previous.value)}`}
              </span>
            </div>
            {reading.source === 'manual' && (
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                disabled={remove.isPending}
                onClick={() => remove.mutate(reading.id)}
                aria-label={t('odometer.delete', { value: format.distance(reading.value) })}
              >
                <X aria-hidden />
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
