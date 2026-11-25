import {
  CSV_DATE_FORMATS,
  CSV_DECIMAL_SEPARATORS,
  CSV_IMPORT_MAX_BYTES,
  type CsvImportSummary,
  fuelQuantityUnit,
  type UserSettings,
  type Vehicle,
} from '@ikrive/shared';
import type {
  CsvDateFormat,
  CsvDecimalSeparator,
  CsvImportResult,
  CsvSourceUnits,
} from '@ikrive/shared/csv-import';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Warning } from '@/components/warning';
import { vehicleTitle } from '@/features/vehicles/display';
import { ColumnMapping } from './column-mapping';
import { csvImportErrorKey } from './errors';
import { PreviewCounts, ResultCounts } from './import-counts';
import { csvImportPreviewQuery, useCsvImport } from './queries';
import { CSV_ACCEPT, type CsvFileRead, type CsvImportModule, readCsvFile } from './read-file';
import {
  DECIMAL_SEPARATOR_KEYS,
  emptyMapping,
  importOptions,
  type MappingDraft,
  previewCounts,
} from './wizard';

const MAX_MB = CSV_IMPORT_MAX_BYTES / (1024 * 1024);

/** Stands for the file while none is chosen: the preview query is disabled then. */
const NO_FILE = { file: new File([], ''), id: 0 };

type Analysis =
  | { generic: false; result: Exclude<CsvImportResult, { status: 'unknown' }> }
  /** `result` is `null` while the mapping is incomplete. */
  | { generic: true; headers: string[]; result: CsvImportResult | null; csv: CsvImportModule };

interface CsvImportWizardProps {
  /** Every vehicle of the user, the first one preselected. */
  vehicles: Vehicle[];
  settings: UserSettings;
}

/**
 * The CSV import: vehicle and file, then the detected format (or the options it lacks, or the mapping of
 * a generic CSV), then the dry run and the import. The file is analyzed in the browser with the parser
 * of the API only to know what to ask; the counters always come from the dry run.
 */
export function CsvImportWizard({ vehicles, settings }: CsvImportWizardProps) {
  const { t } = useTranslation();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [chosen, setChosen] = useState<{ file: File; id: number } | null>(null);
  const [read, setRead] = useState<CsvFileRead | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [mapping, setMapping] = useState<MappingDraft>(emptyMapping);
  const [dateFormat, setDateFormat] = useState<CsvDateFormat>();
  const [decimalSeparator, setDecimalSeparator] = useState<CsvDecimalSeparator>();
  const [result, setResult] = useState<CsvImportSummary | null>(null);
  const lastFileId = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const importCsv = useCsvImport();
  const busy = importCsv.isPending;

  const vehicle = vehicles.find((candidate) => candidate.id === vehicleId);
  const fuelType = vehicle?.fuelType;
  const target = useMemo(
    () =>
      fuelType === undefined
        ? null
        : { distance: settings.distanceUnit, quantity: fuelQuantityUnit(fuelType, settings.volumeUnit) },
    [fuelType, settings.distanceUnit, settings.volumeUnit],
  );
  const parsed = read?.status === 'read' ? read : null;

  const detected = useMemo(() => {
    if (!parsed || !target) return null;
    return parsed.csv.parseCsvImport(parsed.text, {
      target,
      ...(dateFormat ? { dateFormat } : {}),
      ...(decimalSeparator ? { decimalSeparator } : {}),
    });
  }, [parsed, target, dateFormat, decimalSeparator]);
  const generic = detected?.status === 'unknown';

  // The headers the mapping indexes: with a mapping, the parser reads the first row of the file.
  const genericHeaders = useMemo(() => {
    if (!parsed || !target || !generic) return [];
    const filler = { kind: 'odometer', columns: {}, dateFormat: 'ymd', decimalSeparator: '.' } as const;
    const probe = parsed.csv.parseCsvImport(parsed.text, { target, mapping: filler });
    return probe.status === 'needs_options' ? probe.headers : [];
  }, [parsed, target, generic]);

  const options = useMemo(
    () =>
      parsed
        ? importOptions({ generic, mapping, dateFormat, decimalSeparator }, parsed.csv.CSV_REQUIRED_COLUMNS)
        : null,
    [parsed, generic, mapping, dateFormat, decimalSeparator],
  );

  const analysis = useMemo((): Analysis | null => {
    if (!parsed || !target || !detected) return null;
    if (detected.status !== 'unknown') return { generic: false, result: detected };
    const complete = options?.mapping;
    return {
      generic: true,
      headers: genericHeaders,
      csv: parsed.csv,
      result: complete ? parsed.csv.parseCsvImport(parsed.text, { target, mapping: complete }) : null,
    };
  }, [parsed, target, detected, options, genericHeaders]);

  const ready = analysis?.result?.status === 'parsed' && options !== null && chosen !== null;
  const current = chosen ?? NO_FILE;
  const preview = useQuery({
    ...csvImportPreviewQuery(vehicleId, current.file, current.id, options ?? {}),
    enabled: ready && result === null,
  });
  const valid = preview.isSuccess ? previewCounts(preview.data).valid : 0;
  const canImport = ready && preview.isSuccess && valid > 0 && !busy;

  /** A new file (or none) starts the wizard over: mapping, options, preview and summary. */
  const choose = async (file: File | undefined) => {
    const id = ++lastFileId.current;
    setChosen(file ? { file, id } : null);
    setRead(null);
    setReadFailed(false);
    setMapping(emptyMapping);
    setDateFormat(undefined);
    setDecimalSeparator(undefined);
    setResult(null);
    importCsv.reset();
    if (!file) return;
    try {
      const next = await readCsvFile(file);
      if (lastFileId.current === id) setRead(next);
    } catch {
      if (lastFileId.current === id) setReadFailed(true);
    }
  };

  const startOver = () => {
    if (input.current) input.current.value = '';
    void choose(undefined);
  };

  const runImport = async () => {
    if (!chosen || !options) return;
    try {
      setResult(await importCsv.mutateAsync({ vehicleId, file: chosen.file, options }));
    } catch {
      // Shown below from `importCsv.error`.
    }
  };

  if (vehicles.length === 0) {
    return (
      <Card className="grid justify-items-start gap-3 p-8">
        <p className="text-muted-foreground">{t('csvImport.noVehicles')}</p>
        <Link to="/vehicles/new" className="font-semibold underline-offset-4 hover:underline">
          {t('vehicles.add')}
        </Link>
      </Card>
    );
  }

  const error = importCsv.error ?? preview.error;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('csvImport.steps.source')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField id="csv-vehicle" label={t('csvImport.vehicle')}>
            <Select
              id="csv-vehicle"
              value={vehicleId}
              disabled={busy}
              onChange={(event) => {
                setVehicleId(event.target.value);
                setResult(null);
                importCsv.reset();
              }}
            >
              {vehicles.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.plate
                    ? `${vehicleTitle(candidate)} · ${candidate.plate}`
                    : vehicleTitle(candidate)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="csv-file" label={t('csvImport.file')}>
            <Input
              ref={input}
              id="csv-file"
              type="file"
              accept={CSV_ACCEPT}
              disabled={busy}
              className="cursor-pointer file:mr-3 file:border-0 file:bg-transparent file:font-semibold"
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </FormField>
          {chosen && !read && !readFailed && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t('csvImport.reading')}
            </p>
          )}
          {read?.status === 'too_large' && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {t('csvImport.tooLarge', { max: MAX_MB })}
            </p>
          )}
          {readFailed && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {t('common.error')}
            </p>
          )}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('csvImport.result.title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ResultCounts summary={result} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={startOver}>
                {t('csvImport.result.again')}
              </Button>
              <Link
                to="/vehicles/$vehicleId"
                params={{ vehicleId }}
                className="font-semibold underline-offset-4 hover:underline"
              >
                {t('csvImport.result.vehicle')}
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        analysis && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('csvImport.steps.format')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                {analysis.generic ? (
                  <>
                    <p className="text-sm text-muted-foreground">{t('csvImport.genericIntro')}</p>
                    <ColumnMapping
                      headers={analysis.headers}
                      draft={mapping}
                      kindColumns={analysis.csv.CSV_KIND_COLUMNS}
                      required={analysis.csv.CSV_REQUIRED_COLUMNS}
                      disabled={busy}
                      onChange={setMapping}
                    />
                  </>
                ) : (
                  <DetectedFormat
                    result={analysis.result}
                    dateFormat={dateFormat}
                    decimalSeparator={decimalSeparator}
                    disabled={busy}
                    onDateFormat={setDateFormat}
                    onDecimalSeparator={setDecimalSeparator}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('csvImport.preview.title')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                {ready && preview.isPending && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    {t('csvImport.preview.loading')}
                  </p>
                )}
                {ready && preview.isSuccess && <PreviewCounts summary={preview.data} />}
                {error !== null && (
                  <p role="alert" className="text-sm text-destructive">
                    {t(csvImportErrorKey(error))}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" disabled={!canImport} onClick={() => void runImport()}>
                    {busy && <Loader2 aria-hidden className="animate-spin" />}
                    {busy ? t('csvImport.importing') : t('csvImport.import')}
                  </Button>
                  {ready && preview.isSuccess && valid === 0 && (
                    <p className="text-sm text-muted-foreground">{t('csvImport.preview.nothingToImport')}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}

interface DetectedFormatProps {
  result: Exclude<CsvImportResult, { status: 'unknown' }>;
  dateFormat: CsvDateFormat | undefined;
  decimalSeparator: CsvDecimalSeparator | undefined;
  disabled: boolean;
  onDateFormat: (value: CsvDateFormat | undefined) => void;
  onDecimalSeparator: (value: CsvDecimalSeparator | undefined) => void;
}

/** A recognized format: its name, the options the parser could not work out, or the unit mismatch. */
function DetectedFormat({
  result,
  dateFormat,
  decimalSeparator,
  disabled,
  onDateFormat,
  onDecimalSeparator,
}: DetectedFormatProps) {
  const { t } = useTranslation();
  const missing = result.status === 'needs_options' ? result.missing : [];
  // Once chosen, an option stays on screen even though the parser no longer misses it.
  const askDate = missing.includes('dateFormat') || dateFormat !== undefined;
  const askSeparator = missing.includes('decimalSeparator') || decimalSeparator !== undefined;
  const unitsText = ({ distance, quantity }: CsvSourceUnits) =>
    [distance && t(`units.${distance}`), quantity && t(`fuel.units.${quantity}`)]
      .filter((text) => typeof text === 'string')
      .join(', ');

  return (
    <div className="grid gap-5">
      <p className="font-medium">
        {t('csvImport.detected', { format: t(`csvImport.formats.${result.format}`) })}
      </p>
      {(askDate || askSeparator) && (
        <>
          <p className="text-sm text-muted-foreground">{t('csvImport.optionsIntro')}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {askDate && (
              <FormField id="csv-option-date-format" label={t('csvImport.fields.dateFormat')}>
                <Select
                  id="csv-option-date-format"
                  value={dateFormat ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    onDateFormat((event.target.value || undefined) as CsvDateFormat | undefined)
                  }
                >
                  <option value="">{t('csvImport.choose')}</option>
                  {CSV_DATE_FORMATS.map((value) => (
                    <option key={value} value={value}>
                      {t(`csvImport.dateFormats.${value}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            {askSeparator && (
              <FormField id="csv-option-decimal-separator" label={t('csvImport.fields.decimalSeparator')}>
                <Select
                  id="csv-option-decimal-separator"
                  value={decimalSeparator ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    onDecimalSeparator((event.target.value || undefined) as CsvDecimalSeparator | undefined)
                  }
                >
                  <option value="">{t('csvImport.choose')}</option>
                  {CSV_DECIMAL_SEPARATORS.map((value) => (
                    <option key={value} value={value}>
                      {t(`csvImport.decimalSeparators.${DECIMAL_SEPARATOR_KEYS[value]}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
        </>
      )}
      {result.status === 'unit_mismatch' && (
        <Warning>
          {t('csvImport.unitMismatch', {
            source: unitsText(result.source),
            target: unitsText(result.target),
          })}{' '}
          <Link to="/settings" className="font-semibold underline underline-offset-4">
            {t('csvImport.settingsLink')}
          </Link>
        </Warning>
      )}
    </div>
  );
}
