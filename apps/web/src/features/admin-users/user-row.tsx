import { type AdminUser, type AdminUserLockReason, USER_ROLES, type UserRole } from '@ikrive/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Select } from '@/components/ui/select';
import { meQuery } from '@/features/auth/queries';
import { useFormat } from '@/lib/format';
import { adminUserErrorKey } from './errors';
import { useDeleteUser, useDisableUser, useEnableUser, useSetUserRole } from './queries';

const lockId = (userId: string, reason: AdminUserLockReason) => `user-${userId}-lock-${reason}`;

/**
 * An account in the admin list: its data and the actions on it. The API decides which actions are not
 * allowed (`locks`): those controls are disabled and described by a visible text with the reason.
 */
export function UserRow({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setRole = useSetUserRole();
  const disable = useDisableUser();
  const enable = useEnableUser();
  const remove = useDeleteUser();
  const [confirmingDemote, setConfirmingDemote] = useState(false);
  const busy = setRole.isPending || disable.isPending || enable.isPending || remove.isPending;
  const active = user.status === 'active';

  const demoteLock = user.locks.demote;
  const disableLock = active ? user.locks.disable : null;
  const deleteLock = user.locks.delete;
  const reasons = [...new Set([demoteLock, disableLock, deleteLock])].filter(
    (reason): reason is AdminUserLockReason => reason !== null,
  );
  const describedBy = (reason: AdminUserLockReason | null) => (reason ? lockId(user.id, reason) : undefined);

  /** Runs an action with its success toast; errors get a translated toast (a 409 also refreshed the list). */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(t(adminUserErrorKey(error)));
      return false;
    }
  };

  const changeRole = async (role: UserRole) => {
    const done = await run(() => setRole.mutateAsync({ id: user.id, role }), t('adminUsers.roleChanged'));
    if (done && user.isSelf && role === 'user') {
      // The actor is no longer an admin: refresh the session (it hides the nav entry) and leave the page.
      await queryClient.fetchQuery({ ...meQuery, staleTime: 0 });
      await navigate({ to: '/' });
    }
  };

  const onRoleChange = (role: UserRole) => {
    if (role === user.role) return;
    // The select stays on the server value, so cancelling the dialog needs nothing else.
    if (user.isSelf && user.role === 'admin' && role === 'user') return setConfirmingDemote(true);
    void changeRole(role);
  };

  return (
    <li className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
      <div className="grid min-w-0 gap-2">
        <div className="min-w-0">
          <strong className="block font-display text-lg font-bold tracking-[-0.02em] break-words">
            {user.name}
          </strong>
          <span className="block text-sm break-words text-muted-foreground">{user.email}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="stamp">{t(`adminUsers.roles.${user.role}`)}</Badge>
          <Badge variant={active ? 'status' : 'danger'}>{t(`adminUsers.status.${user.status}`)}</Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          {t('adminUsers.createdAt', { date: format.date(user.createdAt) })} ·{' '}
          {t('adminUsers.vehicles', { count: user.vehicleCount })}
        </span>
      </div>
      <div className="grid gap-2 sm:justify-items-end">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-auto min-w-32 sm:min-w-40"
            aria-label={t('adminUsers.roleLabel', { name: user.name })}
            value={user.role}
            disabled={busy || demoteLock !== null}
            aria-describedby={describedBy(demoteLock)}
            onChange={(event) => onRoleChange(event.target.value as UserRole)}
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`adminUsers.roles.${role}`)}
              </option>
            ))}
          </Select>
          {active ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || disableLock !== null}
              aria-describedby={describedBy(disableLock)}
              onClick={() => void run(() => disable.mutateAsync(user.id), t('adminUsers.disabled'))}
            >
              {t('adminUsers.disable')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => enable.mutateAsync(user.id), t('adminUsers.enabled'))}
            >
              {t('adminUsers.enable')}
            </Button>
          )}
          <DeleteUserDialog
            user={user}
            disabled={busy || deleteLock !== null}
            describedBy={describedBy(deleteLock)}
            onConfirm={() => void run(() => remove.mutateAsync(user.id), t('adminUsers.deleted'))}
          />
        </div>
        {reasons.map((reason) => (
          <p
            key={reason}
            id={lockId(user.id, reason)}
            className="text-xs text-muted-foreground sm:text-right"
          >
            {t(`adminUsers.locks.${reason}`)}
          </p>
        ))}
      </div>
      <DemoteSelfDialog
        open={confirmingDemote}
        onOpenChange={setConfirmingDemote}
        onConfirm={() => void changeRole('user')}
      />
    </li>
  );
}

function DeleteUserDialog({
  user,
  disabled,
  describedBy,
  onConfirm,
}: {
  user: AdminUser;
  disabled: boolean;
  describedBy: string | undefined;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={disabled} aria-describedby={describedBy}>
          {t('adminUsers.delete')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t('adminUsers.deleteTitle', { name: user.name })}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('adminUsers.deleteDescription', { email: user.email })}
        </AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={onConfirm}>
              {t('adminUsers.delete')}
            </Button>
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Confirms that the admin removes their own admin role: they lose the admin pages at once. */
function DemoteSelfDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{t('adminUsers.demoteSelfTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('adminUsers.demoteSelfDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={onConfirm}>
              {t('adminUsers.demoteSelfConfirm')}
            </Button>
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
