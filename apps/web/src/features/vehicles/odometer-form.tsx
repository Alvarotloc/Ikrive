import { zodResolver } from '@hookform/resolvers/zod';
import type { Vehicle } from '@ikrive/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { todayIso, useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { parseInteger } from './numbers';
import { useAddOdometerReading } from './queries';

const formSchema = z.object({
  value: z.string().transform(parseInteger).pipe(z.number().int().min(0).max(9_999_999)),
  date: z.iso.date(),
});
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

interface OdometerFormProps {
  vehicle: Pick<Vehicle, 'id' | 'odometer'>;
  /** Accessible label of the value input; defaults to "Current mileage". */
  label?: string;
  className?: string;
}

/** Quick mileage entry, designed for the phone: a big numeric field and today's date by default. */
export function OdometerForm({ vehicle, label, className }: OdometerFormProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const addReading = useAddOdometerReading(vehicle.id);
  const [pickDate, setPickDate] = useState(false);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: '', date: todayIso() },
  });
  const valueId = `odometer-${vehicle.id}`;
  const error = form.formState.errors.value?.message ?? form.formState.errors.date?.message;

  const onSubmit = form.handleSubmit(async (reading) => {
    try {
      await addReading.mutateAsync(reading);
      toast.success(t('odometer.saved', { value: format.distance(reading.value) }));
      form.reset({ value: '', date: todayIso() });
      setPickDate(false);
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.problem.status : 0;
      form.setError('value', {
        message:
          status === 409
            ? t('odometer.errors.backwards')
            : status === 400
              ? t('odometer.errors.future')
              : t('common.error'),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className={cn('grid gap-3', className)} noValidate>
      <Label htmlFor={valueId}>{label ?? t('odometer.current', { unit: format.distanceUnit })}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={valueId}
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            placeholder={vehicle.odometer ? format.number(vehicle.odometer.value) : '0'}
            aria-invalid={Boolean(error)}
            className="min-h-13 pr-12 font-display text-xl font-semibold tracking-[-0.02em]"
            {...form.register('value')}
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-sm text-muted-foreground">
            {format.distanceUnit}
          </span>
        </div>
        <Button type="submit" className="min-h-13" disabled={form.formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        {vehicle.odometer && (
          <span>
            {t('odometer.last', {
              value: format.distance(vehicle.odometer.value),
              date: format.date(vehicle.odometer.date),
            })}
          </span>
        )}
        {pickDate ? (
          <Input
            type="date"
            max={todayIso()}
            aria-label={t('odometer.date')}
            className="min-h-9 w-auto py-1 text-sm"
            {...form.register('date')}
          />
        ) : (
          <button
            type="button"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
            onClick={() => setPickDate(true)}
          >
            {t('odometer.otherDate')}
          </button>
        )}
      </div>
    </form>
  );
}
