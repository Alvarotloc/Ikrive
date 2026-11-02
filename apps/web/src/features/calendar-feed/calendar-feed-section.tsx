import { useSuspenseQuery } from '@tanstack/react-query';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CopyUrlField } from '@/components/copy-url-field';
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
import { useFormat } from '@/lib/format';
import { calendarFeedQuery, useDisableCalendarFeed, useEnableCalendarFeed } from './queries';

/**
 * Settings card of the personal iCal feed: enable, copy the URL, regenerate and disable. The URL is
 * stored hashed, so it only exists in this component's state right after enabling or regenerating.
 */
export function CalendarFeedSection() {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: feed } = useSuspenseQuery(calendarFeedQuery);
  const enable = useEnableCalendarFeed();
  const disable = useDisableCalendarFeed();
  const [url, setUrl] = useState<string>();

  const generate = async (successKey: 'calendarFeed.enabled' | 'calendarFeed.regenerated') => {
    try {
      setUrl((await enable.mutateAsync()).url);
      toast.success(t(successKey));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const turnOff = async () => {
    try {
      await disable.mutateAsync();
      setUrl(undefined);
      toast.success(t('calendarFeed.disabled'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('calendarFeed.title')}</CardTitle>
        <CardDescription>{t('calendarFeed.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!feed.enabled ? (
          <div>
            <Button
              variant="accent"
              onClick={() => generate('calendarFeed.enabled')}
              disabled={enable.isPending}
            >
              <CalendarClock aria-hidden />
              {t('calendarFeed.enable')}
            </Button>
          </div>
        ) : (
          <>
            {feed.createdAt && (
              <p className="text-sm font-semibold">
                {t('calendarFeed.activeSince', { date: format.dateTime(feed.createdAt) })}
              </p>
            )}
            {url && (
              <CopyUrlField
                url={url}
                label={t('calendarFeed.urlLabel')}
                hint={t('calendarFeed.urlHint')}
                copiedMessage={t('calendarFeed.copied')}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={enable.isPending}>
                    <RefreshCw aria-hidden />
                    {t('calendarFeed.regenerate')}
                  </Button>
                }
                title={t('calendarFeed.regenerateTitle')}
                description={t('calendarFeed.regenerateDescription')}
                confirm={t('calendarFeed.regenerate')}
                onConfirm={() => generate('calendarFeed.regenerated')}
              />
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={disable.isPending}
                  >
                    {t('calendarFeed.disable')}
                  </Button>
                }
                title={t('calendarFeed.disableTitle')}
                description={t('calendarFeed.disableDescription')}
                confirm={t('calendarFeed.disable')}
                destructive
                onConfirm={turnOff}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  confirm: string;
  destructive?: boolean;
  onConfirm: () => void;
}

function ConfirmDialog({ trigger, title, description, confirm, destructive, onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
              {confirm}
            </Button>
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
