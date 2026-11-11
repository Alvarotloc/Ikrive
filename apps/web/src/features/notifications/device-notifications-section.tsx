import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DevicePermission } from '@/lib/native-notifications';
import { markPermissionAsked } from './device-notifications';

/**
 * Native app only: settings card with this phone's notification permission. A device preference, not a
 * user setting (like the theme). If the plugin fails, the permission counts as denied.
 */
export function DeviceNotificationsSection() {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<DevicePermission | 'checking'>('checking');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let active = true;
    import('@/lib/native-notifications')
      .then((native) => native.getNotificationPermission())
      .catch((): DevicePermission => 'denied')
      .then((state) => {
        if (active) setPermission(state);
      });
    return () => {
      active = false;
    };
  }, []);

  const request = async () => {
    setRequesting(true);
    markPermissionAsked();
    try {
      const native = await import('@/lib/native-notifications');
      setPermission(await native.requestNotificationPermission());
    } catch {
      setPermission('denied');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('deviceNotifications.title')}</CardTitle>
        <CardDescription>{t('deviceNotifications.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid justify-items-start gap-3">
        <p role="status" className="text-sm">
          {t(`deviceNotifications.${permission}`)}
        </p>
        {permission === 'prompt' && (
          <Button variant="accent" size="sm" onClick={request} disabled={requesting}>
            <BellRing aria-hidden />
            {t('deviceNotifications.allow')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
