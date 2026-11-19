import { zodResolver } from '@hookform/resolvers/zod';
import { DEFAULT_USER_SETTINGS, MAINTENANCE_CATEGORIES, type MaintenanceRecord } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { FileText, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { schedulesQuery } from '@/features/schedules/queries';
import { sortSchedules } from '@/features/schedules/schedules';
import { settingsQuery } from '@/features/settings/queries';
import { todayIso, useFormat } from '@/lib/format';
import { AttachmentPicker } from './attachment-picker';
import {
  defaultsFrom,
  formErrorFor,
  type MaintenanceFormInput,
  type MaintenanceFormValues,
  maintenanceFormSchema,
} from './form';
import { useCreateMaintenance, useUpdateMaintenance } from './queries';
import { useAttachmentUpload } from './use-attachment-upload';

interface MaintenanceFormDialogProps {
  vehicleId: string;
  /** Record being edited; omit to create a new one. */
  record?: MaintenanceRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creating only: the form as it was when Android killed the app with the camera open, and its photo. */
  restored?: RestoredDraft;
}

/** A create form recovered with its camera photo (`camera-restore`). */
export interface RestoredDraft {
  draft: MaintenanceFormInput;
  /** The photo, added as a pending invoice. */
  file: File;
  /** Other invoices had been chosen: they lived only in memory and are gone. */
  lostInvoices: boolean;
}

/** Create or edit a maintenance record in a dialog. */
export function MaintenanceFormDialog({
  vehicleId,
  record,
  open,
  onOpenChange,
  restored,
}: MaintenanceFormDialogProps) {
  const { t } = useTranslation();
  // While saving (and uploading the invoices of a new record) Escape, outside clicks and Cancel are
  // ignored: closing would unmount the form and lose the toasts of the rest of the batch.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (next || !busy) && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle>{record ? t('maintenance.edit') : t('maintenance.add')}</DialogTitle>
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <MaintenanceForm
          vehicleId={vehicleId}
          record={record}
          restored={record ? undefined : restored}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceForm({
  vehicleId,
  record,
  restored,
  onBusyChange,
  onDone,
}: {
  vehicleId: string;
  record: MaintenanceRecord | undefined;
  restored: RestoredDraft | undefined;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { distanceUnit } = useFormat();
  const { data: settings = DEFAULT_USER_SETTINGS } = useQuery(settingsQuery);
  // The selector only appears once the vehicle has schedules; until then the record stays unlinked.
  const { data: schedules = [] } = useQuery(schedulesQuery(vehicleId));
  const create = useCreateMaintenance(vehicleId);
  const update = useUpdateMaintenance(vehicleId);
  const { maxUploadMb, acceptFiles, uploadFiles } = useAttachmentUpload(vehicleId);
  /** Invoices chosen while creating, uploaded once the record exists. The same file may be chosen twice. */
  const [pending, setPending] = useState<{ key: number; file: File }[]>([]);
  const nextKey = useRef(0);
  const [uploadingInvoices, setUploadingInvoices] = useState(false);
  const form = useForm<MaintenanceFormInput, unknown, MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: restored?.draft ?? defaultsFrom(record),
  });
  const { errors, isSubmitting } = form.formState;

  // The recovered photo becomes a pending invoice, once (StrictMode runs effects twice). Nothing is saved
  // until «Save».
  const restoredFile = useRef<File>(undefined);
  useEffect(() => {
    if (!restored || restoredFile.current === restored.file) return;
    restoredFile.current = restored.file;
    const chosen = acceptFiles([restored.file]).map((file) => ({ key: nextKey.current++, file }));
    setPending((current) => [...current, ...chosen]);
    if (restored.lostInvoices) toast(t('camera.restoredLostInvoices'));
  });

  useEffect(() => onBusyChange(isSubmitting), [isSubmitting, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
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

  const showError = (cause: unknown) => {
    const error = formErrorFor(cause);
    form.setError(error.field, { message: t(error.messageKey) });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (record) {
      try {
        await update.mutateAsync({ recordId: record.id, changes: values });
      } catch (cause) {
        return showError(cause);
      }
      toast.success(t('maintenance.updated'));
      return onDone();
    }

    let created: MaintenanceRecord;
    try {
      created = await create.mutateAsync(values);
    } catch (cause) {
      // Nothing is uploaded when the record could not be created.
      return showError(cause);
    }
    toast.success(t('maintenance.created'));
    if (pending.length > 0) {
      setUploadingInvoices(true);
      const { failed } = await uploadFiles(
        created.id,
        pending.map(({ file }) => file),
      );
      if (failed > 0) toast(t('maintenance.attachments.retryHint'));
    }
    // Always close: the record exists, and staying open would invite saving it twice.
    onDone();
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
      {schedules.length > 0 && (
        <FormField id="maintenance-scheduleId" label={t('maintenance.fields.schedule')}>
          <Select {...input('scheduleId')}>
            <option value="">{t('maintenance.noSchedule')}</option>
            {sortSchedules(schedules).map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.title}
              </option>
            ))}
          </Select>
        </FormField>
      )}
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
      {!record && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm leading-none font-semibold">
            {t('maintenance.attachments.sectionTitle')}
          </legend>
          <AttachmentPicker
            context="create"
            maxUploadMb={maxUploadMb}
            disabled={isSubmitting}
            onFiles={(files) => {
              const chosen = acceptFiles(files).map((file) => ({ key: nextKey.current++, file }));
              setPending((current) => [...current, ...chosen]);
            }}
            restoreTarget={() => ({
              kind: 'invoice-draft',
              vehicleId,
              draft: form.getValues(),
              pendingCount: pending.length,
            })}
          />
          {pending.length > 0 && (
            <ul className="grid gap-1">
              {pending.map(({ key, file }) => (
                <li key={key} className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-1">
                  <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
                    {file.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={isSubmitting}
                    aria-label={t('maintenance.attachments.remove', { name: file.name })}
                    onClick={() => setPending((current) => current.filter((chosen) => chosen.key !== key))}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}
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
          {uploadingInvoices ? t('maintenance.attachments.uploadingInvoices') : t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
