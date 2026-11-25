import { CSV_COLUMNS, CSV_ROW_KINDS, type CsvImportSummary } from '@ikrive/shared';
import { useTranslation } from 'react-i18next';
import { Warning } from '@/components/warning';
import { useFormat } from '@/lib/format';
import { type CsvIssue, csvIssues, previewCounts, resultCounts } from './wizard';

const isColumn = (field: string): field is (typeof CSV_COLUMNS)[number] =>
  (CSV_COLUMNS as readonly string[]).includes(field);

function Counter({ label, value }: { label: string; value: number }) {
  const format = useFormat();
  return (
    <div className="grid gap-0.5 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-xl font-semibold">{format.number(value)}</dd>
    </div>
  );
}

/** The reason of a listed row, translated: code and field, conflicting reading, or skip label. */
function useIssueReason() {
  const { t } = useTranslation();
  const format = useFormat();
  return (issue: CsvIssue) => {
    if (issue.type === 'error') {
      const reason = t(`csvImport.errorCodes.${issue.code}`);
      if (issue.field === null) return reason;
      return `${reason} (${isColumn(issue.field) ? t(`csvImport.columns.${issue.field}`) : issue.field})`;
    }
    if (issue.type === 'rejected') {
      // An `odometer_conflict` always carries the reading it contradicts; a `future_date`, none.
      if (issue.reason === 'odometer_conflict' && issue.conflict) {
        return t('csvImport.rejectReasons.odometer_conflict', {
          date: format.date(issue.conflict.date),
          value: format.distance(issue.conflict.value),
        });
      }
      return t('csvImport.rejectReasons.future_date');
    }
    const reason = t(`csvImport.skipReasons.${issue.reason}`);
    return issue.label ? `${reason} (${issue.label})` : reason;
  };
}

/** The rows with errors, rejections and skips, folded: a broken file may list thousands. */
function IssueList({ summary }: { summary: CsvImportSummary }) {
  const { t } = useTranslation();
  const reason = useIssueReason();
  const { items, total } = csvIssues(summary);
  if (total === 0) return null;
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t('csvImport.issues.show', { count: total })}</summary>
      <ul className="mt-2 grid gap-1">
        {items.map((issue) => (
          <li key={`${issue.type}:${issue.row}`}>
            {t('csvImport.issues.row', { row: issue.row, reason: reason(issue) })}
          </li>
        ))}
        {total > items.length && (
          <li className="text-muted-foreground">
            {t('csvImport.issues.more', { count: total - items.length })}
          </li>
        )}
      </ul>
    </details>
  );
}

const droppedKey = ({ notes, station }: CsvImportSummary['droppedFuelFields']) =>
  notes && station
    ? 'csvImport.droppedBoth'
    : notes
      ? 'csvImport.droppedNotes'
      : station
        ? 'csvImport.droppedStation'
        : null;

/** Counters, warnings and rows of the dry run. */
export function PreviewCounts({ summary }: { summary: CsvImportSummary }) {
  const { t } = useTranslation();
  const counts = previewCounts(summary);
  const dropped = droppedKey(summary.droppedFuelFields);
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label={t('csvImport.preview.valid')} value={counts.valid} />
        <Counter label={t('csvImport.preview.duplicates')} value={counts.duplicates} />
        <Counter label={t('csvImport.preview.errors')} value={counts.errors} />
        <Counter label={t('csvImport.preview.skipped')} value={counts.skipped} />
      </dl>
      {dropped && <Warning>{t(dropped)}</Warning>}
      {summary.encodingReplaced && <Warning>{t('csvImport.encoding')}</Warning>}
      <IssueList summary={summary} />
    </div>
  );
}

/** What the import wrote: created by kind, omitted (duplicates + skipped) and errors (unreadable + rejected). */
export function ResultCounts({ summary }: { summary: CsvImportSummary }) {
  const { t } = useTranslation();
  const counts = resultCounts(summary);
  return (
    <div className="grid gap-3">
      <section className="grid gap-2" aria-labelledby="csv-import-created">
        <h3 id="csv-import-created" className="label-caps">
          {t('csvImport.result.created')}
        </h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CSV_ROW_KINDS.map((kind) => (
            <Counter key={kind} label={t(`csvImport.kinds.${kind}`)} value={counts.created[kind]} />
          ))}
        </dl>
      </section>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Counter label={t('csvImport.result.omitted')} value={counts.omitted} />
        <Counter label={t('csvImport.result.errors')} value={counts.errors} />
      </dl>
      <IssueList summary={summary} />
    </div>
  );
}
