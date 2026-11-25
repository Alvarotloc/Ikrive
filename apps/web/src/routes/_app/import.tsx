import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { CsvImportWizard } from '@/features/csv-import/csv-import-wizard';
import { settingsQuery } from '@/features/settings/queries';
import { vehiclesQuery } from '@/features/vehicles/queries';

/**
 * CSV import from another app, linked from Settings. Every vehicle can receive it, archived and sold
 * ones too: their history may come from another app.
 */
export const Route = createFileRoute('/_app/import')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery('all')),
      context.queryClient.ensureQueryData(settingsQuery),
    ]),
  component: ImportPage,
});

function ImportPage() {
  const { t } = useTranslation();
  const { data: vehicles } = useSuspenseQuery(vehiclesQuery('all'));
  const { data: settings } = useSuspenseQuery(settingsQuery);

  return (
    <div className="reveal mx-auto grid w-full max-w-3xl gap-8">
      <PageHeader
        eyebrow={t('csvImport.eyebrow')}
        title={t('csvImport.title')}
        description={t('csvImport.description')}
      />
      <CsvImportWizard vehicles={vehicles} settings={settings} />
    </div>
  );
}
