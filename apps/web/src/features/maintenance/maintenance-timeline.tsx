import type { MaintenanceRecord, Vehicle } from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { useFormat } from '@/lib/format';
import { MaintenanceAttachmentsDialog } from './maintenance-attachments';
import { MaintenanceFormDialog } from './maintenance-form';
import { maintenanceQuery, useDeleteMaintenance } from './queries';
import {
  availableCategories,
  type CategoryFilter,
  filterRecords,
  groupByYear,
  recordDetails,
  resolveFilter,
} from './timeline';

const chipClassName =
  'min-h-9 rounded-full border px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground';

/** Maintenance timeline of a vehicle: category filter, records grouped by year, create, edit and delete. */
export function MaintenanceSection({ vehicle }: { vehicle: Pick<Vehicle, 'id' | 'status'> }) {
  const { t } = useTranslation();
  const { data: records } = useSuspenseQuery(maintenanceQuery(vehicle.id));
  const [selected, setSelected] = useState<CategoryFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRecord>();
  // The record stays set after closing so the dialog can animate out.
  const [attachmentsFor, setAttachmentsFor] = useState<MaintenanceRecord>();
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const categories = availableCategories(records);
  const filter = resolveFilter(selected, categories);
  // The selected category lost its last record: go back to "all" for good.
  if (filter !== selected) setSelected(filter);
  const groups = groupByYear(filterRecords(records, filter));

  const openForm = (record?: MaintenanceRecord) => {
    setEditing(record);
    setFormOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{t('maintenance.title')}</CardTitle>
        {vehicle.status === 'active' && (
          <Button variant="accent" size="sm" onClick={() => openForm()}>
            <Plus aria-hidden />
            {t('maintenance.add')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-5">
        {records.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t('maintenance.empty')}</p>
        ) : (
          <>
            <nav className="flex flex-wrap gap-1" aria-label={t('maintenance.filterLabel')}>
              {(['all', ...categories] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  className={chipClassName}
                  aria-pressed={filter === category}
                  onClick={() => setSelected(category)}
                >
                  {category === 'all' ? t('maintenance.all') : t(`maintenance.categories.${category}`)}
                </button>
              ))}
            </nav>
            {groups.map((group) => (
              <section key={group.year} className="grid gap-1">
                <h3 className="label-caps">{group.year}</h3>
                <ol className="divide-y">
                  {group.records.map((record) => (
                    <MaintenanceRow
                      key={record.id}
                      vehicleId={vehicle.id}
                      record={record}
                      onEdit={() => openForm(record)}
                      onAttachments={() => {
                        setAttachmentsFor(record);
                        setAttachmentsOpen(true);
                      }}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </CardContent>
      <MaintenanceFormDialog
        vehicleId={vehicle.id}
        record={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      {attachmentsFor && (
        <MaintenanceAttachmentsDialog
          vehicleId={vehicle.id}
          record={attachmentsFor}
          open={attachmentsOpen}
          onOpenChange={setAttachmentsOpen}
        />
      )}
    </Card>
  );
}

function MaintenanceRow({
  vehicleId,
  record,
  onEdit,
  onAttachments,
}: {
  vehicleId: string;
  record: MaintenanceRecord;
  onEdit: () => void;
  /** Opens the record's invoices. */
  onAttachments: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const details = [format.date(record.date), ...recordDetails(record, format)];

  // On phones the badge and the actions share the first line, so the text below keeps the full width.
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[auto_1fr_auto]">
      <Badge
        variant="stamp"
        className="col-start-1 row-start-1 min-w-20 justify-center justify-self-start uppercase sm:justify-self-auto"
      >
        {t(`maintenance.categories.${record.category}`)}
      </Badge>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <strong className="block font-semibold break-words">{record.title}</strong>
        <span className="text-sm break-words text-muted-foreground">{details.join(' · ')}</span>
      </div>
      <div className="col-start-2 row-start-1 flex sm:col-start-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onAttachments}
          aria-label={t('maintenance.attachments.open', { title: record.title })}
        >
          <Paperclip aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onEdit}
          aria-label={t('maintenance.editLabel', { title: record.title })}
        >
          <Pencil aria-hidden />
        </Button>
        <DeleteMaintenanceDialog vehicleId={vehicleId} record={record} />
      </div>
    </li>
  );
}

function DeleteMaintenanceDialog({ vehicleId, record }: { vehicleId: string; record: MaintenanceRecord }) {
  const { t } = useTranslation();
  const remove = useDeleteMaintenance(vehicleId);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-destructive hover:text-destructive"
          aria-label={t('maintenance.deleteLabel', { title: record.title })}
        >
          <Trash2 aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t('maintenance.deleteTitle', { title: record.title })}</AlertDialogTitle>
        <AlertDialogDescription>{t('maintenance.deleteDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync(record.id);
                  toast.success(t('maintenance.deleted'));
                } catch {
                  toast.error(t('common.error'));
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
