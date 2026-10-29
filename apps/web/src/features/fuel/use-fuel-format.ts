import {
  DEFAULT_USER_SETTINGS,
  type FuelQuantityUnit,
  type FuelType,
  fuelQuantityUnit,
} from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsQuery } from '@/features/settings/queries';

/** Quantity unit of a vehicle's refuels (the user's volume unit, or kWh if electric) and its formatters. */
export function useFuelFormat(fuelType: FuelType): {
  unit: FuelQuantityUnit;
  unitLabel: string;
  /** "40,125 L" (up to 3 decimals). */
  quantity: (value: number) => string;
  /** "1,459 €/L" (in the user's currency, 2 to 3 decimals). */
  pricePerUnit: (value: number) => string;
} {
  const { t, i18n } = useTranslation();
  const { data: settings = DEFAULT_USER_SETTINGS } = useQuery(settingsQuery);
  const locale = i18n.language;
  const unit = fuelQuantityUnit(fuelType, settings.volumeUnit);
  const unitLabel = t(`fuel.units.${unit}`);

  return useMemo(() => {
    const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    const price = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: settings.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    });
    return {
      unit,
      unitLabel,
      quantity: (value: number) => `${quantity.format(value)} ${unitLabel}`,
      pricePerUnit: (value: number) => `${price.format(value)}/${unitLabel}`,
    };
  }, [locale, settings.currency, unit, unitLabel]);
}
