import { zodResolver } from '@hookform/resolvers/zod';
import { NOTIFICATION_CHANNEL_TYPES, type NotificationChannel } from '@ikrive/shared';
import type { ComponentProps } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  CHANNEL_FIELDS,
  type ChannelField,
  type ChannelFormValues,
  channelFormSchema,
  defaultsFrom,
  toCreateBody,
  toUpdateBody,
} from './form';
import { useCreateChannel, useUpdateChannel } from './queries';

interface ChannelFormDialogProps {
  /** Channel being edited; omit to create a new one. */
  channel?: NotificationChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create or edit a notification channel in a dialog. */
export function ChannelFormDialog({ channel, open, onOpenChange }: ChannelFormDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle>{channel ? t('notificationChannels.edit') : t('notificationChannels.add')}</DialogTitle>
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <ChannelForm channel={channel} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const TOKEN_HELP_ID = 'channel-token-help';

/** Input props of each config field: URLs get the URL keyboard, the token is masked. */
const FIELD_INPUT: Record<ChannelField, ComponentProps<'input'>> = {
  serverUrl: { type: 'url', inputMode: 'url', placeholder: 'https://' },
  url: { type: 'url', inputMode: 'url', placeholder: 'https://' },
  topic: {},
  key: {},
  tag: {},
  token: { type: 'password', autoComplete: 'new-password' },
};

function ChannelForm({ channel, onDone }: { channel: NotificationChannel | undefined; onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const form = useForm<ChannelFormValues>({
    resolver: zodResolver(channelFormSchema(channel ? 'edit' : 'create')),
    defaultValues: defaultsFrom(channel),
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: 'type' });
  // The stored token is kept when the field is left blank, so it is never required when editing.
  const keepsToken = Boolean(channel?.hasToken);
  const tokenOptional = type !== 'gotify' || Boolean(channel);

  const label = (field: ChannelField) =>
    field === 'token' && tokenOptional
      ? t('notificationChannels.fields.tokenOptional')
      : t(`notificationChannels.fields.${field}`);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (channel) {
        await update.mutateAsync({ id: channel.id, changes: toUpdateBody(values) });
      } else {
        await create.mutateAsync(toCreateBody(values));
      }
    } catch {
      return form.setError('root', { message: t('common.error') });
    }
    toast.success(channel ? t('notificationChannels.updated') : t('notificationChannels.created'));
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <FormField id="channel-type" label={t('notificationChannels.fields.type')}>
        {/* The type cannot change: to switch services, delete the channel and add another. */}
        {channel ? (
          <Select id="channel-type" value={channel.type} disabled>
            <option value={channel.type}>{t(`notificationChannels.types.${channel.type}`)}</option>
          </Select>
        ) : (
          <Select id="channel-type" {...form.register('type')}>
            {NOTIFICATION_CHANNEL_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`notificationChannels.types.${value}`)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {CHANNEL_FIELDS[type].map((field) => {
        const id = `channel-${field}`;
        const error = errors.config?.[field]?.message;
        return (
          <FormField key={`${type}-${field}`} id={id} label={label(field)} error={error}>
            <Input
              id={id}
              autoComplete="off"
              spellCheck={false}
              {...FIELD_INPUT[field]}
              aria-invalid={Boolean(error)}
              {...(field === 'token' && keepsToken && { 'aria-describedby': TOKEN_HELP_ID })}
              {...form.register(`config.${field}`)}
            />
            {field === 'token' && keepsToken && (
              <p id={TOKEN_HELP_ID} className="text-sm text-muted-foreground">
                {t('notificationChannels.tokenKeep')}
              </p>
            )}
          </FormField>
        );
      })}
      {errors.root && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
