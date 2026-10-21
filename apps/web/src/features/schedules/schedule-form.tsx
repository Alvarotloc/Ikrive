import { zodResolver } from '@hookform/resolvers/zod';
import { MAINTENANCE_CATEGORIES, type MaintenanceSchedule } from '@ikrive/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { todayIso, useFormat } from '@/lib/format';
import {
  defaultsFrom,
  type ScheduleFormInput,
  type ScheduleFormValues,
  scheduleFormSchema,
  toCreateBody,
  toUpdateBody,
} from './form';
import { useCreateSchedule, useUpdateSchedule } from './queries';

interface ScheduleFormDialogProps {
  vehicleId: string;
  /** Schedule being edited; omit to create a new one. */
  schedule?: MaintenanceSchedule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create or edit a maintenance schedule in a dialog. */
export function ScheduleFormDialog({ vehicleId, schedule, open, onOpenChange }: ScheduleFormDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle>{schedule ? t('schedules.edit') : t('schedules.add')}</DialogTitle>
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <ScheduleForm vehicleId={vehicleId} schedule={schedule} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const LAST_DONE_HELP_ID = 'schedule-lastDone-help';

function ScheduleForm({
  vehicleId,
  schedule,
  onDone,
}: {
  vehicleId: string;
  schedule: MaintenanceSchedule | undefined;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { distanceUnit } = useFormat();
  const create = useCreateSchedule(vehicleId);
  const update = useUpdateSchedule(vehicleId);
  const form = useForm<ScheduleFormInput, unknown, ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema(distanceUnit)),
    defaultValues: defaultsFrom(schedule),
  });
  const { errors, isSubmitting } = form.formState;

  const field = (name: keyof ScheduleFormInput) => ({
    id: `schedule-${name}`,
    label: t(`schedules.fields.${name}`, { unit: distanceUnit }),
    error: errors[name]?.message,
  });
  const input = (name: keyof ScheduleFormInput) => ({
    id: `schedule-${name}`,
    'aria-invalid': Boolean(errors[name]),
    ...form.register(name),
  });
  // The help under "last done" only applies when creating: an existing schedule always has a date.
  const lastDone = (name: 'lastDoneDate' | 'lastDoneOdometer') => ({
    ...input(name),
    ...(!schedule && { 'aria-describedby': LAST_DONE_HELP_ID }),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (schedule) {
        await update.mutateAsync({ scheduleId: schedule.id, changes: toUpdateBody(values) });
      } else {
        await create.mutateAsync(toCreateBody(values));
      }
    } catch {
      return form.setError('root', { message: t('common.error') });
    }
    toast.success(schedule ? t('schedules.updated') : t('schedules.created'));
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <FormField {...field('title')}>
        <Input autoComplete="off" {...input('title')} />
      </FormField>
      <FormField {...field('category')}>
        <Select {...input('category')}>
          {MAINTENANCE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`maintenance.categories.${category}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <FormField {...field('intervalMonths')}>
          <Input inputMode="numeric" autoComplete="off" {...input('intervalMonths')} />
        </FormField>
        <FormField {...field('intervalDistance')}>
          <Input inputMode="numeric" autoComplete="off" {...input('intervalDistance')} />
        </FormField>
      </div>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <FormField {...field('warnDays')}>
          <Input inputMode="numeric" autoComplete="off" {...input('warnDays')} />
        </FormField>
        <FormField {...field('warnDistance')}>
          <Input inputMode="numeric" autoComplete="off" {...input('warnDistance')} />
        </FormField>
      </div>
      <div className="grid gap-2">
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <FormField {...field('lastDoneDate')}>
            <Input type="date" max={todayIso()} {...lastDone('lastDoneDate')} />
          </FormField>
          <FormField {...field('lastDoneOdometer')}>
            <Input inputMode="numeric" autoComplete="off" {...lastDone('lastDoneOdometer')} />
          </FormField>
        </div>
        {!schedule && (
          <p id={LAST_DONE_HELP_ID} className="text-sm text-muted-foreground">
            {t('schedules.lastDoneHelp')}
          </p>
        )}
      </div>
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
