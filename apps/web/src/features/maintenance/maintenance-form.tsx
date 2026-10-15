import { zodResolver } from '@hookform/resolvers/zod';
import { DEFAULT_USER_SETTINGS, MAINTENANCE_CATEGORIES, type MaintenanceRecord } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { settingsQuery } from '@/features/settings/queries';
import { todayIso, useFormat } from '@/lib/format';
import {
  defaultsFrom,
  formErrorFor,
  type MaintenanceFormInput,
  type MaintenanceFormValues,
  maintenanceFormSchema,
} from './form';
import { useCreateMaintenance, useUpdateMaintenance } from './queries';

interface MaintenanceFormDialogProps {
  vehicleId: string;
  /** Record being edited; omit to create a new one. */
  record?: MaintenanceRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create or edit a maintenance record in a dialog. */
export function MaintenanceFormDialog({ vehicleId, record, open, onOpenChange }: MaintenanceFormDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle>{record ? t('maintenance.edit') : t('maintenance.add')}</DialogTitle>
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <MaintenanceForm vehicleId={vehicleId} record={record} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceForm({
  vehicleId,
  record,
  onDone,
}: {
  vehicleId: string;
  record: MaintenanceRecord | undefined;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { distanceUnit } = useFormat();
  const { data: settings = DEFAULT_USER_SETTINGS } = useQuery(settingsQuery);
  const create = useCreateMaintenance(vehicleId);
  const update = useUpdateMaintenance(vehicleId);
  const form = useForm<MaintenanceFormInput, unknown, MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: defaultsFrom(record),
  });
  const { errors, isSubmitting } = form.formState;
  const field = (name: keyof MaintenanceFormInput) => ({
    id: `maintenance-${name}`,
    label: t(`maintenance.fields.${name}`, { unit: distanceUnit, currency: settings.currency }),
    error: errors[name]?.message,
  });
  const input = (name: keyof MaintenanceFormInput) => ({
    id: `maintenance-${name}`,
    'aria-invalid': Boolean(errors[name]),
    ...form.register(name),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (record) {
        await update.mutateAsync({ recordId: record.id, changes: values });
        toast.success(t('maintenance.updated'));
      } else {
        await create.mutateAsync(values);
        toast.success(t('maintenance.created'));
      }
      onDone();
    } catch (cause) {
      const error = formErrorFor(cause);
      form.setError(error.field, { message: t(error.messageKey) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <FormField {...field('date')}>
          <Input type="date" max={todayIso()} {...input('date')} />
        </FormField>
        <FormField {...field('odometer')}>
          <Input inputMode="numeric" autoComplete="off" {...input('odometer')} />
        </FormField>
      </div>
      <FormField {...field('category')}>
        <Select {...input('category')}>
          {MAINTENANCE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`maintenance.categories.${category}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField {...field('title')}>
        <Input autoComplete="off" {...input('title')} />
      </FormField>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <FormField {...field('workshop')}>
          <Input autoComplete="off" {...input('workshop')} />
        </FormField>
        <FormField {...field('cost')}>
          <Input inputMode="decimal" autoComplete="off" {...input('cost')} />
        </FormField>
      </div>
      <FormField {...field('description')}>
        <Textarea {...input('description')} />
      </FormField>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          className="size-5 cursor-pointer accent-primary"
          {...form.register('includeInReport')}
        />
        {t('maintenance.fields.includeInReport')}
      </label>
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
