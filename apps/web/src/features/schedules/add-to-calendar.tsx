import {
  googleCalendarUrl,
  LOCALES,
  type Locale,
  type MaintenanceSchedule,
  outlookCalendarUrl,
  scheduleCalendarEvent,
  toICalendar,
  type Vehicle,
} from '@ikrive/shared';
import { CalendarPlus, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { addToDeviceCalendar, downloadIcs } from '@/features/calendar/actions';
import { vehicleTitle } from '@/features/vehicles/display';
import { useFormat } from '@/lib/format';
import { isNativeApp } from '@/lib/platform';
import { getServerUrl } from '@/lib/server';
import { cn } from '@/lib/utils';

const toLocale = (language: string): Locale =>
  LOCALES.find((locale) => language === locale || language.startsWith(`${locale}-`)) ?? 'es';

/** File name from the event title: lowercase ASCII words joined by dashes. */
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ikrive';

interface AddToCalendarMenuProps {
  schedule: MaintenanceSchedule;
  vehicle: Pick<Vehicle, 'id' | 'name' | 'make' | 'model'>;
}

/**
 * «Add to calendar» for one schedule: Google Calendar, Outlook and an `.ics` download (in the native app,
 * the phone calendar instead of the `.ics`). Without a next due date the button stays pressable (a real
 * `disabled` shows nothing on phones) and explains why.
 */
export function AddToCalendarMenu({ schedule, vehicle }: AddToCalendarMenuProps) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const label = t('schedules.calendar.label', { title: schedule.title });
  const event = scheduleCalendarEvent({
    schedule,
    vehicle: { id: vehicle.id, name: vehicleTitle(vehicle) },
    // The web of the server (server mode, e.g. in the mobile app) or this one: a link that works elsewhere.
    baseUrl: getServerUrl() ?? window.location.origin,
    locale: toLocale(i18n.language),
    distanceUnit: format.distanceUnit,
  });

  const trigger = (disabled: boolean) => (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-9', disabled && 'opacity-50')}
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      <CalendarPlus aria-hidden />
    </Button>
  );

  if (!event) {
    return (
      <Popover>
        <PopoverTrigger asChild>{trigger(true)}</PopoverTrigger>
        <PopoverContent align="end" aria-label={label} className="p-4 text-sm leading-relaxed">
          {t('schedules.calendar.noDate')}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger(false)}</DropdownMenuTrigger>
      <DropdownMenuContent aria-label={label}>
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <CalendarPlus aria-hidden />
            {t('schedules.calendar.google')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={outlookCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <CalendarPlus aria-hidden />
            {t('schedules.calendar.outlook')}
          </a>
        </DropdownMenuItem>
        {isNativeApp() ? (
          <DropdownMenuItem
            onSelect={() => {
              addToDeviceCalendar(event).catch(() => toast.error(t('schedules.calendar.deviceError')));
            }}
          >
            <CalendarPlus aria-hidden />
            {t('schedules.calendar.device')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => {
              downloadIcs(`${slug(event.title)}.ics`, toICalendar([event], { now: new Date() })).catch(() =>
                toast.error(t('common.fileError')),
              );
            }}
          >
            <Download aria-hidden />
            {t('schedules.calendar.ics')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
