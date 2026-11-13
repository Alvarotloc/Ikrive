import type { Vehicle } from '@ikrive/shared';
import { useNavigate } from '@tanstack/react-router';
import { Archive, ArchiveRestore, HandCoins, Trash, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { todayIso } from '@/lib/format';
import { vehicleTitle } from './display';
import { useDeleteVehicle, useUpdateVehicle } from './queries';

/** Archive, sold and delete actions for the vehicle file. */
export function VehicleActions({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const update = useUpdateVehicle(vehicle.id);

  const change = async (changes: Parameters<typeof update.mutateAsync>[0], message: string) => {
    try {
      await update.mutateAsync(changes);
    } catch {
      toast.error(t('common.error'));
      return;
    }
    toast.success(message);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {vehicle.status === 'sold' ? (
        <Button variant="outline" onClick={() => change({ soldAt: null }, t('vehicles.actions.unsold'))}>
          <Undo2 aria-hidden />
          {t('vehicles.actions.undoSold')}
        </Button>
      ) : (
        <SoldDialog
          vehicle={vehicle}
          onConfirm={(soldAt) => change({ soldAt }, t('vehicles.actions.sold'))}
        />
      )}
      {vehicle.status === 'archived' && (
        <Button variant="outline" onClick={() => change({ archived: false }, t('vehicles.actions.restored'))}>
          <ArchiveRestore aria-hidden />
          {t('vehicles.actions.restore')}
        </Button>
      )}
      {vehicle.status === 'active' && (
        <Button variant="outline" onClick={() => change({ archived: true }, t('vehicles.actions.archived'))}>
          <Archive aria-hidden />
          {t('vehicles.actions.archive')}
        </Button>
      )}
      <DeleteDialog vehicle={vehicle} />
    </div>
  );
}

function SoldDialog({
  vehicle,
  onConfirm,
}: {
  vehicle: Vehicle;
  onConfirm: (date: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <HandCoins aria-hidden />
          {t('vehicles.actions.markSold')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            await onConfirm(date);
            setOpen(false);
          }}
        >
          <DialogTitle>{t('vehicles.actions.markSoldTitle', { name: vehicleTitle(vehicle) })}</DialogTitle>
          <DialogDescription>{t('vehicles.actions.markSoldDescription')}</DialogDescription>
          <FormField id="soldAt" label={t('vehicles.fields.soldAt')}>
            <Input
              id="soldAt"
              type="date"
              required
              max={todayIso()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!date}>
              {t('vehicles.actions.markSold')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useDeleteVehicle(vehicle.id);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          <Trash aria-hidden />
          {t('common.delete')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>
          {t('vehicles.actions.deleteTitle', { name: vehicleTitle(vehicle) })}
        </AlertDialogTitle>
        <AlertDialogDescription>{t('vehicles.actions.deleteDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync();
                } catch {
                  toast.error(t('common.error'));
                  return;
                }
                toast.success(t('vehicles.actions.deleted'));
                await navigate({ to: '/vehicles' });
              }}
            >
              {t('vehicles.actions.deleteConfirm')}
            </Button>
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
