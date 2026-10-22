import type { Notification } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { notificationsQuery, useMarkAllNotificationsRead, useMarkNotificationRead } from './queries';

/**
 * Bell with the unread count and a panel with the latest notifications. It never suspends: the
 * layout keeps working while the list loads or when it fails.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useQuery(notificationsQuery);
  const markAllRead = useMarkAllNotificationsRead();
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t('notifications.open', { count: unreadCount })}
        >
          <Bell aria-hidden />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] leading-none font-bold text-background"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={t('notifications.title')} className="w-96 overflow-hidden">
        {/* Wraps the action under the title when the panel is narrower than both (phones). */}
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 border-b px-4 py-2">
          <h2 className="font-display text-base font-semibold">{t('notifications.title')}</h2>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck aria-hidden />
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isPending ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('notifications.loading')}
            </p>
          ) : isError ? (
            <p role="alert" className="px-4 py-6 text-center text-sm text-destructive">
              {t('notifications.error')}
            </p>
          ) : data.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('notifications.empty')}</p>
          ) : (
            <ul className="divide-y">
              {data.items.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onOpen={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({ notification, onOpen }: { notification: Notification; onOpen: () => void }) {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const unread = notification.readAt === null;

  const open = () => {
    if (unread) markRead.mutate(notification.id);
    onOpen();
    // `link` is an untyped internal path stored by the API: `href` avoids casting it to a route.
    if (notification.link) void navigate({ href: notification.link });
  };

  return (
    <button
      type="button"
      onClick={open}
      className="grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <span className="flex items-center gap-2">
        {unread && <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />}
        <span className="label-caps text-muted-foreground">
          {t(`notifications.types.${notification.type}`)}
        </span>
      </span>
      <span
        className={cn('text-[0.9375rem]', unread ? 'font-semibold text-foreground' : 'text-muted-foreground')}
      >
        {notification.title}
      </span>
      {notification.body && <span className="text-sm text-muted-foreground">{notification.body}</span>}
      <time dateTime={notification.createdAt} className="text-xs text-muted-foreground">
        {format.dateTime(notification.createdAt)}
      </time>
    </button>
  );
}
