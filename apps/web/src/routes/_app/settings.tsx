import { zodResolver } from '@hookform/resolvers/zod';
import {
  DISTANCE_UNITS,
  LOCALES,
  type UserSettings,
  userSettingsSchema,
  VOLUME_UNITS,
  WEEKDAYS,
} from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Upload } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { InfoPopover } from '@/components/info-popover';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CalendarFeedSection } from '@/features/calendar-feed/calendar-feed-section';
import { calendarFeedQuery } from '@/features/calendar-feed/queries';
import { DataPortabilitySection } from '@/features/data-portability/data-section';
import { NotificationChannelsSection } from '@/features/notification-channels/channels-section';
import { notificationChannelsQuery } from '@/features/notification-channels/queries';
import { DeviceNotificationsSection } from '@/features/notifications/device-notifications-section';
import { settingsQuery, useUpdateSettings } from '@/features/settings/queries';
import { isLocalMode } from '@/lib/app-mode';
import { isNativeApp } from '@/lib/platform';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';

/** `00:00` … `23:00`: the same text in every language. */
const REMINDER_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export const Route = createFileRoute('/_app/settings')({
  // Local mode has no notification channels nor iCal feed: nothing to ask for.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQuery),
      ...(isLocalMode()
        ? []
        : [
            context.queryClient.ensureQueryData(notificationChannelsQuery),
            context.queryClient.ensureQueryData(calendarFeedQuery),
          ]),
    ]),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data } = useSuspenseQuery(settingsQuery);
  const update = useUpdateSettings();
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const form = useForm<UserSettings>({ resolver: zodResolver(userSettingsSchema), values: data });
  const { errors } = form.formState;
  const weekdays = t('weekdays', { returnObjects: true }) as string[];
  // Local mode checks the reminders on the device (not hourly on a server): its own help for the hour.
  const local = isLocalMode();

  const onSubmit = form.handleSubmit(async (values) => {
    // The authenticated layout applies the saved locale; the toast already speaks it.
    let saved: UserSettings;
    try {
      saved = await update.mutateAsync(values);
    } catch {
      toast.error(t('common.error'));
      return;
    }
    toast.success(i18n.getFixedT(saved.locale)('settings.saved'));
  });

  return (
    <div className="reveal grid gap-8">
      <PageHeader
        eyebrow={t('settings.eyebrow')}
        title={t('settings.title')}
        description={t('settings.description')}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.preferences')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2" noValidate>
            <FormField id="currency" label={t('settings.currency')} error={errors.currency?.message}>
              <Input id="currency" maxLength={3} className="uppercase" {...form.register('currency')} />
            </FormField>
            <FormField id="locale" label={t('settings.locale')}>
              <Select id="locale" {...form.register('locale')}>
                {LOCALES.map((locale) => (
                  <option key={locale} value={locale}>
                    {t(`locales.${locale}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="distanceUnit" label={t('settings.distanceUnit')}>
              <Select id="distanceUnit" {...form.register('distanceUnit')}>
                {DISTANCE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(`units.${unit}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="volumeUnit" label={t('settings.volumeUnit')}>
              <Select id="volumeUnit" {...form.register('volumeUnit')}>
                {VOLUME_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(`units.${unit}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="timezone" label={t('settings.timezone')} error={errors.timezone?.message}>
              <Input id="timezone" {...form.register('timezone')} />
            </FormField>
            <FormField
              id="odometerReminderWeekday"
              label={t('settings.odometerReminderWeekday')}
              labelAction={
                <InfoPopover label={t('settings.odometerReminderWeekdayInfoLabel')}>
                  {t('settings.odometerReminderWeekdayInfo')}
                </InfoPopover>
              }
            >
              <Select
                id="odometerReminderWeekday"
                {...form.register('odometerReminderWeekday', {
                  // «No avisar» is the empty option: `null`, not `NaN`.
                  setValueAs: (value: string | number | null) =>
                    value === '' || value === null ? null : Number(value),
                })}
              >
                <option value="">{t('settings.odometerReminderOff')}</option>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {weekdays[day]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              id="reminderHour"
              label={t('settings.reminderHour')}
              labelAction={
                <InfoPopover label={t('settings.reminderHourInfoLabel')}>
                  {t(local ? 'settings.reminderHourInfoLocal' : 'settings.reminderHourInfo')}
                </InfoPopover>
              }
            >
              <Select
                id="reminderHour"
                aria-describedby="reminderHour-hint"
                {...form.register('reminderHour', { valueAsNumber: true })}
              >
                {REMINDER_HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </Select>
              <p id="reminderHour-hint" className="text-sm text-muted-foreground">
                {t('settings.reminderHourHint')}
              </p>
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {!local && (
        <Suspense>
          <NotificationChannelsSection />
        </Suspense>
      )}
      {isNativeApp() && <DeviceNotificationsSection />}
      {!local && (
        <Suspense>
          <CalendarFeedSection />
        </Suspense>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance')}</CardTitle>
          <CardDescription>{t('settings.appearanceDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <FormField id="theme" label={t('settings.theme')}>
            <Select
              id="theme"
              value={theme}
              onChange={(event) => {
                const next = event.target.value as Theme;
                setTheme(next);
                applyTheme(next);
              }}
            >
              {(['system', 'light', 'dark'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`settings.themes.${value}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </CardContent>
      </Card>
      <DataPortabilitySection />
      <Card>
        <CardHeader>
          <CardTitle>{t('csvImport.settingsCard.title')}</CardTitle>
          <CardDescription>{t('csvImport.settingsCard.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/import">
              <Upload aria-hidden />
              {t('csvImport.settingsCard.link')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
