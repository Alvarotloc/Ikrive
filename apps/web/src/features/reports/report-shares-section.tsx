import type { ReportShare, ReportShareStatus, SaleReportOptions } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CopyUrlField } from '@/components/copy-url-field';
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
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Warning } from '@/components/warning';
import { clientConfigQuery } from '@/lib/client-config';
import { useFormat } from '@/lib/format';
import { reportSharesQuery, useCreateReportShare, useRevokeReportShare } from './queries';

const EXPIRY_DAYS = [7, 30, 90] as const;
const DEFAULT_EXPIRY_DAYS = 30;

const STATUS_BADGE = {
  active: 'status',
  expired: 'warning',
  revoked: 'danger',
} as const satisfies Record<ReportShareStatus, 'status' | 'warning' | 'danger'>;

const OPTION_KEYS = [
  'hidePrices',
  'hidePlate',
  'hideVin',
  'includeInvoices',
] as const satisfies ReadonlyArray<keyof SaleReportOptions>;

/**
 * Public links to the sale report inside its dialog: create one with the checked options, copy its URL
 * (only known right after creating it) and list or revoke the vehicle's links.
 */
export function ReportSharesSection({
  vehicleId,
  options,
}: {
  vehicleId: string;
  options: SaleReportOptions;
}) {
  const { t } = useTranslation();
  const expiryId = useId();
  const { data: config } = useQuery(clientConfigQuery);
  const create = useCreateReportShare(vehicleId);
  const [expiresInDays, setExpiresInDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [url, setUrl] = useState<string>();

  const createLink = async () => {
    try {
      setUrl((await create.mutateAsync({ ...options, expiresInDays })).url);
    } catch {
      toast.error(t('reportShares.createError'));
    }
  };

  return (
    <section className="grid gap-4" aria-labelledby={`${expiryId}-title`}>
      <div className="grid gap-1.5">
        <h3 id={`${expiryId}-title`} className="font-display text-lg font-semibold">
          {t('reportShares.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('reportShares.description')}</p>
      </div>
      {config?.localBaseUrl && <Warning>{t('reportShares.localWarning')}</Warning>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid gap-2 sm:w-40">
          <Label htmlFor={expiryId}>{t('reportShares.expiry')}</Label>
          <Select
            id={expiryId}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value))}
          >
            {EXPIRY_DAYS.map((days) => (
              <option key={days} value={days}>
                {t('reportShares.days', { count: days })}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="outline" disabled={create.isPending} onClick={createLink}>
          {create.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Link aria-hidden />}
          {create.isPending ? t('reportShares.creating') : t('reportShares.create')}
        </Button>
      </div>
      {url && (
        <CopyUrlField
          url={url}
          label={t('reportShares.urlLabel')}
          hint={t('reportShares.urlHint')}
          copiedMessage={t('reportShares.copied')}
        />
      )}
      <ShareList vehicleId={vehicleId} />
    </section>
  );
}

function ShareList({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation();
  const { data: shares, isPending, isError } = useQuery(reportSharesQuery(vehicleId));

  if (isPending) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (isError) return <p className="text-sm text-destructive">{t('reportShares.loadError')}</p>;
  if (shares.length === 0) return <p className="text-sm text-muted-foreground">{t('reportShares.empty')}</p>;
  return (
    <ul className="grid gap-2">
      {shares.map((share) => (
        <ShareRow key={share.id} vehicleId={vehicleId} share={share} />
      ))}
    </ul>
  );
}

function ShareRow({ vehicleId, share }: { vehicleId: string; share: ReportShare }) {
  const { t } = useTranslation();
  // Here and not in the section: an empty list does not need the user's time zone.
  const format = useFormat();
  const options = OPTION_KEYS.filter((key) => share[key]);

  return (
    <li className="flex items-center gap-3 rounded-lg border p-3">
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge variant={STATUS_BADGE[share.status]}>{t(`reportShares.status.${share.status}`)}</Badge>
          <span className="text-sm">
            {t('reportShares.expiresOn', { date: format.dateTime(share.expiresAt) })}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.length === 0 ? (
            <Badge variant="stamp">{t('reportShares.options.full')}</Badge>
          ) : (
            options.map((key) => (
              <Badge key={key} variant="stamp">
                {t(`reportShares.options.${key}`)}
              </Badge>
            ))
          )}
        </div>
      </div>
      {share.status === 'active' && <RevokeDialog vehicleId={vehicleId} shareId={share.id} />}
    </li>
  );
}

function RevokeDialog({ vehicleId, shareId }: { vehicleId: string; shareId: string }) {
  const { t } = useTranslation();
  const revoke = useRevokeReportShare(vehicleId);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={revoke.isPending}
        >
          {t('reportShares.revoke')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t('reportShares.revokeTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('reportShares.revokeDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="ghost">
              {t('common.cancel')}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                try {
                  await revoke.mutateAsync(shareId);
                } catch {
                  toast.error(t('reportShares.revokeError'));
                }
              }}
            >
              {t('reportShares.revoke')}
            </Button>
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
