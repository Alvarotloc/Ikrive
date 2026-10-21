import type { MaintenanceSchedule, ScheduleStatus, Vehicle } from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { schedulesQuery, useDeleteSchedule } from './queries';
import { ScheduleFormDialog } from './schedule-form';
import { sortSchedules } from './schedules';

/** Upcoming maintenance of a vehicle: its schedules in due order, create, edit and delete. */
export function SchedulesSection({ vehicle }: { vehicle: Pick<Vehicle, 'id' | 'status'> }) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(schedulesQuery(vehicle.id));
  const schedules = sortSchedules(data);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceSchedule>();

  const openForm = (schedule?: MaintenanceSchedule) => {
    setEditing(schedule);
    setFormOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{t('schedules.title')}</CardTitle>
        {vehicle.status === 'active' && (
          <Button variant="accent" size="sm" onClick={() => openForm()}>
            <Plus aria-hidden />
            {t('schedules.add')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {schedules.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t('schedules.empty')}</p>
        ) : (
          <ol className="divide-y">
            {schedules.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                vehicleId={vehicle.id}
                schedule={schedule}
                onEdit={() => openForm(schedule)}
              />
            ))}
          </ol>
        )}
      </CardContent>
      <ScheduleFormDialog
        vehicleId={vehicle.id}
        schedule={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </Card>
  );
}

const STATUS_VARIANT = { ok: 'status', due_soon: 'warning', overdue: 'danger' } as const;

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const { t } = useTranslation();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`schedules.status.${status}`)}</Badge>;
}

function ScheduleRow({
  vehicleId,
  schedule,
  onEdit,
}: {
  vehicleId: string;
  schedule: MaintenanceSchedule;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { intervalMonths, intervalDistance, nextDueDate, nextDueOdometer } = schedule;

  const distance = intervalDistance === null ? undefined : format.distance(intervalDistance);
  const interval =
    intervalMonths !== null && distance !== undefined
      ? t('schedules.interval.both', { count: intervalMonths, distance })
      : intervalMonths !== null
        ? t('schedules.interval.months', { count: intervalMonths })
        : t('schedules.interval.distance', { distance });

  const dueParts = [
    nextDueDate &&
      (schedule.nextDueDateEstimated
        ? t('schedules.estimated', { date: format.date(nextDueDate) })
        : format.date(nextDueDate)),
    nextDueOdometer !== null && format.distance(nextDueOdometer),
  ].filter((part) => typeof part === 'string');
  const due =
    dueParts.length === 0 ? t('schedules.noData') : t('schedules.nextDue', { due: dueParts.join(' · ') });

  // On phones the badges and the actions share the first line, so the text below keeps the full width.
  // From sm up the badges column has a fixed width so the titles line up across rows.
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[9rem_1fr_auto]">
      <div className="col-start-1 row-start-1 flex flex-wrap items-center gap-2 sm:flex-col sm:items-start">
        <ScheduleStatusBadge status={schedule.status} />
        <Badge variant="stamp" className="justify-center uppercase">
          {t(`maintenance.categories.${schedule.category}`)}
        </Badge>
      </div>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <strong className="block font-semibold break-words">{schedule.title}</strong>
        <span className="block text-sm break-words text-muted-foreground">{interval}</span>
        <span className="block text-sm font-medium break-words">{due}</span>
      </div>
      <div className="col-start-2 row-start-1 flex sm:col-start-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onEdit}
          aria-label={t('schedules.editLabel', { title: schedule.title })}
        >
          <Pencil aria-hidden />
        </Button>
        <DeleteScheduleDialog vehicleId={vehicleId} schedule={schedule} />
      </div>
    </li>
  );
}

function DeleteScheduleDialog({ vehicleId, schedule }: { vehicleId: string; schedule: MaintenanceSchedule }) {
  const { t } = useTranslation();
  const remove = useDeleteSchedule(vehicleId);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-destructive hover:text-destructive"
          aria-label={t('schedules.deleteLabel', { title: schedule.title })}
        >
          <Trash2 aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t('schedules.deleteTitle', { title: schedule.title })}</AlertDialogTitle>
        <AlertDialogDescription>{t('schedules.deleteDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync(schedule.id);
                  toast.success(t('schedules.deleted'));
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
