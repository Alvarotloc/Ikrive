import type { Attachment } from '@ikrive/shared';
import { Download } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { inlineUrl } from './attachments';

type ViewedAttachment = Pick<Attachment, 'url' | 'originalName'>;

interface AttachmentViewerProps {
  /** `null` while closed. */
  attachment: ViewedAttachment | null;
  onClose(): void;
}

/**
 * Enlarged view of an image invoice, stacked on top of the invoices dialog: closing it (Escape, the
 * overlay or «Cerrar») only closes the viewer.
 */
export function AttachmentViewer({ attachment, onClose }: AttachmentViewerProps) {
  // Controlled without a `DialogTrigger`, so Radix has nowhere to return the focus: remember the
  // element that opened the viewer (the invoice card) and focus it again on close.
  const opener = useRef<HTMLElement | null>(null);

  return (
    <Dialog open={attachment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[95dvh] max-w-[min(64rem,95vw)]"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
      >
        {/* Keyed by url so the error state does not leak from one invoice to the next. */}
        {attachment ? <ViewerBody key={attachment.url} attachment={attachment} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ attachment }: { attachment: ViewedAttachment }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const name = attachment.originalName;

  return (
    <>
      <DialogTitle className="min-w-0 pr-2 break-words">{name}</DialogTitle>
      {/* The muted box doubles as the placeholder while the original loads. */}
      <div className="grid min-h-40 min-w-0 place-items-center overflow-hidden rounded-md bg-muted">
        {failed ? (
          <p className="p-6 text-center text-sm text-destructive" role="alert">
            {t('maintenance.attachments.viewerError')}
          </p>
        ) : (
          <img
            src={inlineUrl(attachment.url)}
            alt={name}
            onError={() => setFailed(true)}
            className="max-h-[75dvh] w-full object-contain"
          />
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">{t('maintenance.attachments.close')}</Button>
        </DialogClose>
        <Button asChild variant="outline">
          <a href={attachment.url} download>
            <Download aria-hidden />
            {t('maintenance.attachments.download')}
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}
