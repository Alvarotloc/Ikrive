import type { DataImportSummary, ImportedVehicleMatch } from '@ikrive/shared';
import { Download, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { vehicleTitle } from '@/features/vehicles/display';
import { ApiError } from '@/lib/api-client';
import { useFormat } from '@/lib/format';
import { IMPORT_ACCEPT, importErrorKey } from './import';
import { EXPORT_URL, useImportData } from './queries';

/** The counters of the summary, in the order they are shown. */
const SUMMARY_KEYS = [
  'vehicles',
  'odometerReadings',
  'maintenanceSchedules',
  'maintenanceRecords',
  'fuelLogs',
  'attachments',
  'photos',
  'notificationChannels',
] as const;

/** Translation key of the fields an imported vehicle matches by. */
const matchedByKey = (matchedBy: ImportedVehicleMatch['matchedBy']) =>
  matchedBy.length > 1
    ? 'dataPortability.matchingVehicles.fields.both'
    : matchedBy[0] === 'vin'
      ? 'dataPortability.matchingVehicles.fields.vin'
      : 'dataPortability.matchingVehicles.fields.plate';

/**
 * Settings card «Tus datos»: downloads the export with a plain link (streamed by the browser) and
 * imports a zip after a confirmation, showing the summary of what was added.
 */
export function DataPortabilitySection() {
  const { t } = useTranslation();
  const format = useFormat();
  const input = useRef<HTMLInputElement>(null);
  const importData = useImportData();
  const [pending, setPending] = useState<File | null>(null);
  const [summary, setSummary] = useState<DataImportSummary | null>(null);

  const startImport = async (file: File) => {
    setPending(null);
    setSummary(null);
    // `mutateAsync`, not `mutate()` callbacks: the toast still shows if the user leaves Settings.
    try {
      setSummary(await importData.mutateAsync(file));
      toast.success(t('dataPortability.imported'));
    } catch (error) {
      toast.error(t(importErrorKey(error)), {
        description: error instanceof ApiError ? error.problem.detail : undefined,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dataPortability.title')}</CardTitle>
        <CardDescription>{t('dataPortability.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid justify-items-start gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={EXPORT_URL} download>
                <Download aria-hidden />
                {t('dataPortability.export')}
              </a>
            </Button>
            <input
              ref={input}
              type="file"
              accept={IMPORT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label={t('dataPortability.fileInput')}
              disabled={importData.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared so choosing the same file again fires `change` again.
                event.target.value = '';
                if (file) setPending(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={importData.isPending}
              onClick={() => input.current?.click()}
            >
              {importData.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Upload aria-hidden />
              )}
              {importData.isPending ? t('dataPortability.importing') : t('dataPortability.import')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('dataPortability.exportHint')}</p>
        </div>

        {summary && (
          <section className="grid gap-3" aria-labelledby="data-import-summary">
            <h3 id="data-import-summary" className="label-caps">
              {t('dataPortability.summaryTitle')}
            </h3>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SUMMARY_KEYS.map((key) => (
                <div key={key} className="grid gap-0.5 rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{t(`dataPortability.summary.${key}`)}</dt>
                  <dd className="font-display text-xl font-semibold">{format.number(summary[key])}</dd>
                </div>
              ))}
            </dl>
            {summary.skipped.notificationChannels > 0 && (
              <p role="status" className="rounded-lg border bg-muted p-3 text-sm">
                {t('dataPortability.skippedChannels', { count: summary.skipped.notificationChannels })}
              </p>
            )}
            {summary.matchingVehicles.length > 0 && (
              <div role="status" className="grid gap-1.5 rounded-lg border bg-muted p-3 text-sm">
                <p className="font-medium">{t('dataPortability.matchingVehicles.title')}</p>
                <ul className="grid list-disc gap-1 pl-5">
                  {summary.matchingVehicles.map((match) => (
                    <li key={`${match.imported.id}:${match.existing.id}`}>
                      {t('dataPortability.matchingVehicles.item', {
                        imported: vehicleTitle(match.imported),
                        existing: vehicleTitle(match.existing),
                        fields: t(matchedByKey(match.matchedBy)),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </CardContent>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('dataPortability.confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('dataPortability.confirmDescription', { name: pending?.name ?? '' })}
          </AlertDialogDescription>
          <DialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={() => {
                  if (pending) void startImport(pending);
                }}
              >
                {t('dataPortability.confirm')}
              </Button>
            </AlertDialogAction>
          </DialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
