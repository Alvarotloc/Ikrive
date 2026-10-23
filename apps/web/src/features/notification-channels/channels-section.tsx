import type { NotificationChannel } from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ChannelFormDialog } from './channel-form';
import { channelSummary } from './form';
import { notificationChannelsQuery, useDeleteChannel, useTestChannel, useUpdateChannel } from './queries';

/** Settings card with the user's external channels: add, edit, enable or disable, test and delete. */
export function NotificationChannelsSection() {
  const { t } = useTranslation();
  const { data: channels } = useSuspenseQuery(notificationChannelsQuery);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationChannel>();

  const openForm = (channel?: NotificationChannel) => {
    setEditing(channel);
    setFormOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>{t('notificationChannels.title')}</CardTitle>
          <CardDescription>{t('notificationChannels.description')}</CardDescription>
        </div>
        <Button variant="accent" size="sm" onClick={() => openForm()}>
          <Plus aria-hidden />
          {t('notificationChannels.add')}
        </Button>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t('notificationChannels.empty')}</p>
        ) : (
          <ul className="divide-y">
            {channels.map((channel) => (
              <ChannelRow key={channel.id} channel={channel} onEdit={() => openForm(channel)} />
            ))}
          </ul>
        )}
      </CardContent>
      <ChannelFormDialog channel={editing} open={formOpen} onOpenChange={setFormOpen} />
    </Card>
  );
}

function ChannelRow({ channel, onEdit }: { channel: NotificationChannel; onEdit: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateChannel();
  const test = useTestChannel();
  const summary = channelSummary(channel);
  const name = `${t(`notificationChannels.types.${channel.type}`)} ${summary}`;
  // While the change is saving, the checkbox already shows the requested state.
  const enabled = update.isPending ? (update.variables.changes.enabled ?? channel.enabled) : channel.enabled;

  const toggle = async (next: boolean) => {
    try {
      await update.mutateAsync({ id: channel.id, changes: { type: channel.type, enabled: next } });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const runTest = async () => {
    try {
      const result = await test.mutateAsync(channel.id);
      if (result.ok) toast.success(t('notificationChannels.testOk'));
      else toast.error(t('notificationChannels.testFailed', { error: result.error }));
    } catch {
      toast.error(t('common.error'));
    }
  };

  // Phones: details on top, controls below. From sm up: one line per channel.
  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="stamp" className="uppercase">
            {t(`notificationChannels.types.${channel.type}`)}
          </Badge>
          <span className="min-w-0 font-semibold break-all">{summary}</span>
        </div>
        {channel.lastError && (
          <p className="text-sm break-words text-destructive">
            {t('notificationChannels.lastError', { error: channel.lastError })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <label className="mr-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold sm:min-h-9">
          <input
            type="checkbox"
            className="size-5 cursor-pointer accent-primary"
            checked={enabled}
            disabled={update.isPending}
            onChange={(event) => toggle(event.target.checked)}
            aria-label={t('notificationChannels.enabledLabel', { channel: name })}
          />
          <span aria-hidden>{t('notificationChannels.enabled')}</span>
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 sm:min-h-9"
          onClick={runTest}
          disabled={test.isPending}
          aria-label={t('notificationChannels.testLabel', { channel: name })}
        >
          <Send aria-hidden />
          {t('notificationChannels.test')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="sm:size-9"
          onClick={onEdit}
          aria-label={t('notificationChannels.editLabel', { channel: name })}
        >
          <Pencil aria-hidden />
        </Button>
        <DeleteChannelDialog channel={channel} name={name} />
      </div>
    </li>
  );
}

function DeleteChannelDialog({ channel, name }: { channel: NotificationChannel; name: string }) {
  const { t } = useTranslation();
  const remove = useDeleteChannel();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive sm:size-9"
          aria-label={t('notificationChannels.deleteLabel', { channel: name })}
        >
          <Trash2 aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t('notificationChannels.deleteTitle', { channel: name })}</AlertDialogTitle>
        <AlertDialogDescription>{t('notificationChannels.deleteDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync(channel.id);
                  toast.success(t('notificationChannels.deleted'));
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
