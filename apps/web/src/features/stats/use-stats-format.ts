import { DEFAULT_USER_SETTINGS, type FuelType } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFuelFormat } from '@/features/fuel/use-fuel-format';
import { settingsQuery } from '@/features/settings/queries';
import { useFormat } from '@/lib/format';
import { createStatsFormatters, type StatsFormatters } from './format';

/** Formatters for the statistics of a vehicle, in the user's units, currency and language. */
export function useStatsFormat(
  fuelType: FuelType,
): StatsFormatters & Pick<ReturnType<typeof useFormat>, 'distance' | 'money' | 'date' | 'distanceUnit'> {
  const { i18n } = useTranslation();
  const { data: settings = DEFAULT_USER_SETTINGS } = useQuery(settingsQuery);
  const { distance, money, date, distanceUnit } = useFormat();
  const { unitLabel } = useFuelFormat(fuelType);
  const locale = i18n.language;

  return useMemo(
    () => ({
      ...createStatsFormatters({
        locale,
        currency: settings.currency,
        distanceUnit,
        quantityUnitLabel: unitLabel,
      }),
      distance,
      money,
      date,
      distanceUnit,
    }),
    [locale, settings.currency, distanceUnit, unitLabel, distance, money, date],
  );
}
