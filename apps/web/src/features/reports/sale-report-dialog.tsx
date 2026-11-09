import type { SaleReportOptions, Vehicle } from '@ikrive/shared';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Warning } from '@/components/warning';
import { useDownloadSaleReport } from './queries';
import { ReportSharesSection } from './report-shares-section';
import { hidesAnything } from './sale-report';

type ReportVehicle = Pick<Vehicle, 'id' | 'name' | 'make' | 'model' | 'plate' | 'vin'>;

const NO_OPTIONS: SaleReportOptions = {
  hidePrices: false,
  hidePlate: false,
  hideVin: false,
  includeInvoices: false,
};

/** «Sale report» button and the dialog with its privacy options, the PDF download and the public links. */
export function SaleReportDialog({ vehicle }: { vehicle: ReportVehicle }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText aria-hidden />
          {t('saleReport.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {/* Radix unmounts the content on close, so every opening starts with the options unchecked. */}
        <SaleReportForm vehicle={vehicle} onDownloaded={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SaleReportForm({ vehicle, onDownloaded }: { vehicle: ReportVehicle; onDownloaded: () => void }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState(NO_OPTIONS);
  const report = useDownloadSaleReport(vehicle, { onError: () => toast.error(t('saleReport.error')) });
  const hiding = hidesAnything(options);

  const option = (key: keyof SaleReportOptions, label: string, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
        checked={options[key]}
        onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))}
      />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        report.mutate(options, { onSuccess: onDownloaded });
      }}
    >
      <DialogTitle>{t('saleReport.title')}</DialogTitle>
      <DialogDescription>{t('saleReport.description')}</DialogDescription>
      <div>
        <div className="grid gap-3">
          {option('hidePrices', t('saleReport.hidePrices'))}
          {vehicle.plate && option('hidePlate', t('saleReport.hidePlate'))}
          {vehicle.vin && option('hideVin', t('saleReport.hideVin'))}
          <hr className="my-1" />
          {option('includeInvoices', t('saleReport.includeInvoices'), t('saleReport.includeInvoicesHint'))}
        </div>
        {/* Always rendered (not `display:none`) so screen readers announce the warnings; the margin only applies with content. */}
        <div className="grid gap-2 not-empty:mt-5" aria-live="polite">
          {hiding && <Warning>{t('saleReport.freeTextWarning')}</Warning>}
          {hiding && options.includeInvoices && <Warning>{t('saleReport.invoicesWarning')}</Warning>}
        </div>
      </div>
      <hr />
      {/* Inside the form so the link uses the same checked options; its buttons are `type="button"`. */}
      <ReportSharesSection vehicleId={vehicle.id} options={options} />
      {/* Last, below the links, so the dialog ends with its actions; it still submits the download form. */}
      <DialogFooter className="border-t pt-5">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={report.isPending}>
          {report.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />}
          {report.isPending ? t('saleReport.generating') : t('saleReport.download')}
        </Button>
      </DialogFooter>
    </form>
  );
}
