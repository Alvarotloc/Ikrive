import type { FuelLog, Vehicle } from '@ikrive/shared';
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
import { sortFuelLogs } from './fuel';
import { FuelLogFormDialog } from './fuel-log-form';
import { fuelLogsQuery, useDeleteFuelLog } from './queries';
import { useFuelFormat } from './use-fuel-format';

type FuelVehicle = Pick<Vehicle, 'id' | 'status' | 'fuelType' | 'odometer'>;

/** Refuels of a vehicle, newest first: create, edit and delete. */
export function FuelLogsSection({ vehicle }: { vehicle: FuelVehicle }) {
  const { t } = useTranslation();
  const { data: logs } = useSuspenseQuery(fuelLogsQuery(vehicle.id));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FuelLog>();

  const openForm = (log?: FuelLog) => {
    setEditing(log);
    setFormOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{t('fuel.title')}</CardTitle>
        {vehicle.status === 'active' && (
          <Button variant="accent" size="sm" onClick={() => openForm()}>
            <Plus aria-hidden />
            {t('fuel.add')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t('fuel.empty')}</p>
        ) : (
          <ol className="divide-y">
            {sortFuelLogs(logs).map((log) => (
              <FuelLogRow key={log.id} vehicle={vehicle} log={log} onEdit={() => openForm(log)} />
            ))}
          </ol>
        )}
      </CardContent>
      <FuelLogFormDialog vehicle={vehicle} log={editing} open={formOpen} onOpenChange={setFormOpen} />
    </Card>
  );
}

function FuelLogRow({ vehicle, log, onEdit }: { vehicle: FuelVehicle; log: FuelLog; onEdit: () => void }) {
  const { t } = useTranslation();
  const format = useFormat();
  const fuel = useFuelFormat(vehicle.fuelType);
  const date = format.date(log.date);
  const details = [date, format.distance(log.odometer), fuel.pricePerUnit(log.pricePerUnit)];

  // On phones the badge and the actions share the first line, so the text below keeps the full width.
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[auto_1fr_auto]">
      <Badge
        variant="stamp"
        className="col-start-1 row-start-1 min-w-20 justify-center justify-self-start uppercase sm:justify-self-auto"
      >
        {log.fullTank ? t('fuel.fullTank') : t('fuel.partial')}
      </Badge>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <strong className="block font-semibold break-words">
          {format.money(log.totalPrice)} · {fuel.quantity(log.quantity)}
        </strong>
        <span className="text-sm break-words text-muted-foreground">{details.join(' · ')}</span>
      </div>
      <div className="col-start-2 row-start-1 flex sm:col-start-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onEdit}
          aria-label={t('fuel.editLabel', { date })}
        >
          <Pencil aria-hidden />
        </Button>
        <DeleteFuelLogDialog vehicleId={vehicle.id} log={log} date={date} />
      </div>
    </li>
  );
}

function DeleteFuelLogDialog({ vehicleId, log, date }: { vehicleId: string; log: FuelLog; date: string }) {
  const { t } = useTranslation();
  const remove = useDeleteFuelLog(vehicleId);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-destructive hover:text-destructive"
          aria-label={t('fuel.deleteLabel', { date })}
        >
          <Trash2 aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t('fuel.deleteTitle', { date })}</AlertDialogTitle>
        <AlertDialogDescription>{t('fuel.deleteDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync(log.id);
                  toast.success(t('fuel.deleted'));
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
