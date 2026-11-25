import { CSV_DATE_FORMATS, CSV_DECIMAL_SEPARATORS, CSV_ROW_KINDS } from '@ikrive/shared';
import type { CsvColumn, CsvDateFormat, CsvDecimalSeparator, CsvRowKind } from '@ikrive/shared/csv-import';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { Select } from '@/components/ui/select';
import { type CsvRequiredColumns, DECIMAL_SEPARATOR_KEYS, type MappingDraft } from './wizard';

interface ColumnMappingProps {
  /** Headers of the file, by index: what the mapping points to. */
  headers: string[];
  draft: MappingDraft;
  /** `CSV_KIND_COLUMNS` and `CSV_REQUIRED_COLUMNS` of the parser chunk. */
  kindColumns: Readonly<Record<CsvRowKind, readonly CsvColumn[]>>;
  required: CsvRequiredColumns;
  disabled: boolean;
  onChange: (draft: MappingDraft) => void;
}

/**
 * Mapping of a generic CSV: the kind of row, a column (or none) for each of its fields, the date format
 * and the decimal separator. Nothing is guessed: every choice starts empty.
 */
export function ColumnMapping({
  headers,
  draft,
  kindColumns,
  required,
  disabled,
  onChange,
}: ColumnMappingProps) {
  const { t } = useTranslation();
  const { kind } = draft;
  const isRequired = (column: CsvColumn) =>
    kind !== '' && required[kind].some((group) => group.includes(column));
  // Headers may be repeated or empty: the mapping points to columns by index.
  const options = headers.map((header, index) => ({
    index,
    label: header || t('csvImport.columnN', { n: index + 1 }),
  }));

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="csv-kind" label={t('csvImport.fields.kind')}>
          <Select
            id="csv-kind"
            value={kind}
            disabled={disabled}
            // Another kind has other fields: the columns start over.
            onChange={(event) =>
              onChange({ ...draft, kind: event.target.value as CsvRowKind | '', columns: {} })
            }
          >
            <option value="">{t('csvImport.choose')}</option>
            {CSV_ROW_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`csvImport.kinds.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {kind !== '' && (
        <div className="grid gap-5 sm:grid-cols-2">
          {kindColumns[kind].map((column) => {
            const id = `csv-column-${column}`;
            const label = t(`csvImport.columns.${column}`);
            return (
              <FormField key={column} id={id} label={isRequired(column) ? `${label} *` : label}>
                <Select
                  id={id}
                  value={draft.columns[column]?.toString() ?? ''}
                  disabled={disabled}
                  onChange={(event) => {
                    const { [column]: _previous, ...columns } = draft.columns;
                    const { value } = event.target;
                    onChange({
                      ...draft,
                      columns: value === '' ? columns : { ...columns, [column]: Number(value) },
                    });
                  }}
                >
                  <option value="">{t('csvImport.noColumn')}</option>
                  {options.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            );
          })}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="csv-date-format" label={t('csvImport.fields.dateFormat')}>
          <Select
            id="csv-date-format"
            value={draft.dateFormat}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, dateFormat: event.target.value as CsvDateFormat | '' })}
          >
            <option value="">{t('csvImport.choose')}</option>
            {CSV_DATE_FORMATS.map((value) => (
              <option key={value} value={value}>
                {t(`csvImport.dateFormats.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="csv-decimal-separator" label={t('csvImport.fields.decimalSeparator')}>
          <Select
            id="csv-decimal-separator"
            value={draft.decimalSeparator}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, decimalSeparator: event.target.value as CsvDecimalSeparator | '' })
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
      </div>
    </div>
  );
}
