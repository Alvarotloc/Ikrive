import { zodResolver } from '@hookform/resolvers/zod';
import { DEFAULT_USER_SETTINGS, type FuelLog, type Vehicle } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { settingsQuery } from '@/features/settings/queries';
import { todayIso, useFormat } from '@/lib/format';
import { defaultsFrom, type FuelFormInput, type FuelFormValues, formErrorFor, fuelFormSchema } from './form';
import {
  computeThirdValue,
  FUEL_FRACTION_DIGITS,
  FUEL_VALUE_FIELDS,
  type FuelValueField,
  formatInputNumber,
  parseFuelNumber,
} from './fuel';
import { useCreateFuelLog, useUpdateFuelLog } from './queries';
import { useFuelFormat } from './use-fuel-format';

type FuelVehicle = Pick<Vehicle, 'id' | 'fuelType' | 'odometer'>;

interface FuelLogFormDialogProps {
  vehicle: FuelVehicle;
  /** Refuel being edited; omit to create a new one. */
  log?: FuelLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create or edit a refuel in a dialog. */
export function FuelLogFormDialog({ vehicle, log, open, onOpenChange }: FuelLogFormDialogProps) {
  const { t } = useTranslation();
  // While saving, Escape, outside clicks and Cancel are ignored.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (next || !busy) && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle>{log ? t('fuel.edit') : t('fuel.add')}</DialogTitle>
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <FuelLogForm vehicle={vehicle} log={log} onBusyChange={setBusy} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const RECOMPUTE_HINT_ID = 'fuel-recompute-hint';
const computedHintId = (field: FuelValueField) => `fuel-${field}-computed`;

function FuelLogForm({
  vehicle,
  log,
  onBusyChange,
  onDone,
}: {
  vehicle: FuelVehicle;
  log: FuelLog | undefined;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const fuel = useFuelFormat(vehicle.fuelType);
  const { data: settings = DEFAULT_USER_SETTINGS } = useQuery(settingsQuery);
  const create = useCreateFuelLog(vehicle.id);
  const update = useUpdateFuelLog(vehicle.id);
  const form = useForm<FuelFormInput, unknown, FuelFormValues>({
    resolver: zodResolver(fuelFormSchema),
    defaultValues: defaultsFrom({ log, lastOdometer: vehicle.odometer?.value }),
  });
  const { errors, isSubmitting, isSubmitted } = form.formState;
  /** The value filled in from the other two. When editing, the three come from the ticket. */
  const [computed, setComputed] = useState<FuelValueField | null>(null);
  /** A computed value the user took over; it stays as typed until another value changes. */
  const userOwned = useRef<FuelValueField | null>(null);

  useEffect(() => onBusyChange(isSubmitting), [isSubmitting, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  /** Current values; a malformed one counts as NaN (present but unusable). */
  const readValues = () => {
    const read = (field: FuelValueField) => {
      const result = parseFuelNumber(form.getValues(field), FUEL_FRACTION_DIGITS[field]);
      return result.ok ? result.value : Number.NaN;
    };
    return { quantity: read('quantity'), totalPrice: read('totalPrice'), pricePerUnit: read('pricePerUnit') };
  };

  const writeValue = (field: FuelValueField, value: number | null) =>
    form.setValue(field, value === null ? '' : formatInputNumber(value, i18n.language), {
      shouldValidate: isSubmitted,
    });

  /** Keeps the third value in sync while typing (`setValue` does not fire this handler again). */
  const onValueChange = (edited: FuelValueField) => {
    // Typing over or clearing the computed value makes it the user's own: it is not
    // refilled (not even once it is empty) until one of the other two changes.
    if (computed === edited) {
      setComputed(null);
      userOwned.current = edited;
      return;
    }
    if (userOwned.current === edited) return;
    userOwned.current = null;
    const current = computed;
    const values = readValues();
    if (current) {
      const value = computeThirdValue({ ...values, [current]: null }, current);
      writeValue(current, value);
      if (value !== null) return;
    }
    const blank = FUEL_VALUE_FIELDS.filter((field) => values[field] === null || field === current);
    const target = blank.length === 1 ? blank[0] : undefined;
    const value = target ? computeThirdValue({ ...values, [target]: null }, target) : null;
    if (target && value !== null) {
      writeValue(target, value);
      setComputed(target);
    } else {
      setComputed(null);
    }
  };

  const label = (name: keyof FuelFormInput) =>
    t(`fuel.fields.${name}`, {
      unit: name === 'odometer' ? format.distanceUnit : fuel.unitLabel,
      currency: settings.currency,
    });
  const field = (name: keyof FuelFormInput) => ({
    id: `fuel-${name}`,
    label: label(name),
    error: errors[name]?.message,
  });
  const input = (name: keyof FuelFormInput, onChange?: () => void) => ({
    id: `fuel-${name}`,
    'aria-invalid': Boolean(errors[name]),
    ...form.register(name, { onChange }),
  });
  const valueInput = (name: FuelValueField) => {
    const describedBy = [computed === name && computedHintId(name), log && RECOMPUTE_HINT_ID].filter(Boolean);
    return {
      ...input(name, () => onValueChange(name)),
      inputMode: 'decimal' as const,
      enterKeyHint: 'next' as const,
      autoComplete: 'off',
      'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
    };
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (log) await update.mutateAsync({ logId: log.id, changes: values });
      else await create.mutateAsync(values);
    } catch (cause) {
      const error = formErrorFor(cause);
      form.setError(error.field, { message: t(error.messageKey) });
      return;
    }
    toast.success(t(log ? 'fuel.updated' : 'fuel.created'));
    onDone();
  });

  const lastReading = !log && vehicle.odometer;

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <FormField {...field('odometer')}>
        <div className="relative">
          <Input
            inputMode="numeric"
            enterKeyHint="next"
            autoComplete="off"
            className="min-h-13 pr-12 font-display text-xl font-semibold tracking-[-0.02em]"
            aria-describedby={lastReading ? 'fuel-odometer-last' : undefined}
            {...input('odometer')}
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-sm text-muted-foreground">
            {format.distanceUnit}
          </span>
        </div>
        {lastReading && (
          <p id="fuel-odometer-last" className="text-sm text-muted-foreground">
            {t('fuel.lastReading', {
              value: format.distance(lastReading.value),
              date: format.date(lastReading.date),
            })}
          </p>
        )}
      </FormField>
      <div className="grid gap-3">
        <div className="grid items-start gap-5 sm:grid-cols-3 sm:gap-3">
          {FUEL_VALUE_FIELDS.map((name) => (
            <FormField key={name} {...field(name)}>
              <Input {...valueInput(name)} />
              {computed === name && (
                <p id={computedHintId(name)} className="label-caps text-success">
                  {t('fuel.computed')}
                </p>
              )}
            </FormField>
          ))}
        </div>
        {log && (
          <p id={RECOMPUTE_HINT_ID} className="text-sm text-muted-foreground">
            {t('fuel.recomputeHint')}
          </p>
        )}
      </div>
      <div className="grid gap-3">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5 cursor-pointer accent-primary"
            {...form.register('fullTank')}
          />
          {t('fuel.fields.fullTank')}
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5 cursor-pointer accent-primary"
            {...form.register('missedPrevious')}
          />
          {t('fuel.fields.missedPrevious')}
        </label>
      </div>
      <FormField {...field('date')}>
        <Input type="date" max={todayIso()} {...input('date')} />
      </FormField>
      {errors.root && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
