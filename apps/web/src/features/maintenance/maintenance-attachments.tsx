import type { Attachment, MaintenanceRecord } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiImage } from '@/components/api-image';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { openApiFile, saveApiFile } from '@/lib/api-files';
import { isServerMode } from '@/lib/server';
import { AttachmentPicker } from './attachment-picker';
import { AttachmentViewer } from './attachment-viewer';
import { inlineUrl } from './attachments';
import { attachmentsQuery, useDeleteAttachment } from './queries';
import { useAttachmentUpload } from './use-attachment-upload';

type RecordRef = Pick<MaintenanceRecord, 'id' | 'title'>;

interface MaintenanceAttachmentsDialogProps {
  vehicleId: string;
  record: RecordRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Invoices of a maintenance record: list, upload and delete. */
export function MaintenanceAttachmentsDialog({
  vehicleId,
  record,
  open,
  onOpenChange,
}: MaintenanceAttachmentsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <div className="grid gap-1">
          <DialogTitle>{t('maintenance.attachments.title')}</DialogTitle>
          <DialogDescription className="break-words">{record.title}</DialogDescription>
        </div>
        {/* Mounted only while open, so the queries run when the dialog opens. */}
        <MaintenanceAttachments vehicleId={vehicleId} record={record} />
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceAttachments({ vehicleId, record }: { vehicleId: string; record: RecordRef }) {
  const { t } = useTranslation();
  const { data: attachments, isPending, isError } = useQuery(attachmentsQuery(vehicleId, record.id));
  const { maxUploadMb, acceptFiles, uploadFiles } = useAttachmentUpload(vehicleId);
  // Local state rather than the mutation's `isPending`, which flickers between the files of a batch.
  const [uploading, setUploading] = useState(false);
  // One viewer for the whole list.
  const [viewing, setViewing] = useState<Attachment | null>(null);

  const onFiles = async (files: File[]) => {
    const accepted = acceptFiles(files);
    if (accepted.length === 0) return;
    setUploading(true);
    try {
      await uploadFiles(record.id, accepted);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-5">
      <AttachmentPicker
        context="dialog"
        maxUploadMb={maxUploadMb}
        disabled={uploading}
        busy={uploading}
        onFiles={onFiles}
      />
      {isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t('common.error')}
        </p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('maintenance.attachments.empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              vehicleId={vehicleId}
              recordId={record.id}
              attachment={attachment}
              onView={setViewing}
            />
          ))}
        </ul>
      )}
      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

const cardActionClassName =
  'grid w-full min-w-0 gap-2 p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function AttachmentCard({
  vehicleId,
  recordId,
  attachment,
  onView,
}: {
  vehicleId: string;
  recordId: string;
  attachment: Attachment;
  onView: (attachment: Attachment) => void;
}) {
  const { t } = useTranslation();
  const name = attachment.originalName;
  // Server mode has no cookie: the PDF and the download are fetched with the token (`api-files`).
  const serverMode = isServerMode();
  const fileAction = (action: () => Promise<void>) => async () => {
    try {
      await action();
    } catch {
      toast.error(t('common.fileError'));
    }
  };
  const nameLabel = (
    <span className="truncate text-sm" title={name}>
      {name}
    </span>
  );
  const pdfIcon = (
    <span className="grid aspect-square w-full place-items-center rounded-md bg-muted text-muted-foreground">
      <FileText aria-hidden className="size-10" />
    </span>
  );
  const openPdfLabel = t('maintenance.attachments.openPdf', { name });
  const downloadLabel = t('maintenance.attachments.downloadLabel', { name });
  const downloadClassName = 'absolute top-3 left-3 size-9 bg-card/90 text-foreground shadow-sm hover:bg-card';

  return (
    <li className="relative min-w-0 overflow-hidden rounded-lg border bg-card">
      {attachment.thumbnailUrl ? (
        // Images open in the in-app viewer.
        <button
          type="button"
          onClick={() => onView(attachment)}
          aria-label={t('maintenance.attachments.view', { name })}
          className={cardActionClassName}
        >
          <ApiImage
            src={attachment.thumbnailUrl}
            alt={name}
            loading="lazy"
            className="aspect-square w-full rounded-md bg-muted object-cover"
          />
          {nameLabel}
        </button>
      ) : serverMode ? (
        <button
          type="button"
          onClick={fileAction(() => openApiFile(inlineUrl(attachment.url)))}
          aria-label={openPdfLabel}
          className={cardActionClassName}
        >
          {pdfIcon}
          {nameLabel}
        </button>
      ) : (
        // PDFs open in a new tab with the browser's viewer (`?inline=1`), without a `window.opener`.
        <a
          href={inlineUrl(attachment.url)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={openPdfLabel}
          className={cardActionClassName}
        >
          {pdfIcon}
          {nameLabel}
        </a>
      )}
      {serverMode ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={downloadClassName}
          aria-label={downloadLabel}
          onClick={fileAction(() => saveApiFile(attachment.url, name))}
        >
          <Download aria-hidden />
        </Button>
      ) : (
        <Button asChild variant="ghost" size="icon" className={downloadClassName}>
          <a href={attachment.url} download aria-label={downloadLabel}>
            <Download aria-hidden />
          </a>
        </Button>
      )}
      <DeleteAttachmentDialog vehicleId={vehicleId} recordId={recordId} attachment={attachment} />
    </li>
  );
}

function DeleteAttachmentDialog({
  vehicleId,
  recordId,
  attachment,
}: {
  vehicleId: string;
  recordId: string;
  attachment: Attachment;
}) {
  const { t } = useTranslation();
  const remove = useDeleteAttachment(vehicleId, recordId);
  const name = attachment.originalName;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 size-9 bg-card/90 text-destructive shadow-sm hover:bg-card hover:text-destructive"
          aria-label={t('maintenance.attachments.deleteLabel', { name })}
        >
          <Trash2 aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle className="break-words">
          {t('maintenance.attachments.deleteTitle', { name })}
        </AlertDialogTitle>
        <AlertDialogDescription>{t('maintenance.attachments.deleteDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync(attachment.id);
                  toast.success(t('maintenance.attachments.deleted'));
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
