import { Paperclip, Upload } from 'lucide-react';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ATTACHMENT_ACCEPT } from './attachments';

interface AttachmentPickerProps {
  /** `dialog`: "Upload invoices" in the attachments dialog; `create`: "Add invoices" in the create form. */
  context: 'dialog' | 'create';
  /** Shown in the help line; omit it while the limit is unknown. */
  maxUploadMb?: number;
  disabled?: boolean;
  /** An upload is in flight: the button says so. */
  busy?: boolean;
  onFiles: (files: File[]) => void;
}

/** Hidden multiple file input driven by a button, with the accepted types and the size limit below. */
export function AttachmentPicker({ context, maxUploadMb, disabled, busy, onFiles }: AttachmentPickerProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const inDialog = context === 'dialog';
  const label = inDialog ? t('maintenance.attachments.upload') : t('maintenance.attachments.add');

  return (
    <div className="grid justify-items-start gap-1.5">
      <input
        ref={input}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={t('maintenance.attachments.fileInput')}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Cleared so choosing the same file again fires `change` again.
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant={inDialog ? 'accent' : 'outline'}
        disabled={disabled}
        aria-describedby={maxUploadMb === undefined ? undefined : helpId}
        onClick={() => input.current?.click()}
      >
        {inDialog ? <Upload aria-hidden /> : <Paperclip aria-hidden />}
        {busy ? t('maintenance.attachments.uploading') : label}
      </Button>
      {maxUploadMb !== undefined && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {t('maintenance.attachments.help', { max: maxUploadMb })}
        </p>
      )}
    </div>
  );
}
