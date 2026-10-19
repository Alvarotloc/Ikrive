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
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { settingsQuery, useUpdateSettings } from '@/features/settings/queries';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';

export const Route = createFileRoute('/_app/settings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
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

  const onSubmit = form.handleSubmit(async (values) => {
    // The authenticated layout applies the saved locale; the toast already speaks it.
    const saved = await update.mutateAsync(values);
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
            <FormField id="odometerReminderWeekday" label={t('settings.odometerReminderWeekday')}>
              <Select
                id="odometerReminderWeekday"
                {...form.register('odometerReminderWeekday', { valueAsNumber: true })}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {weekdays[day]}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
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
    </div>
  );
}
