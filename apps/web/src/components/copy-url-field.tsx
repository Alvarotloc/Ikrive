import { Copy } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CopyUrlFieldProps {
  url: string;
  label: string;
  hint: string;
  /** Toast shown after copying. */
  copiedMessage: string;
}

/** Read-only URL (selected on focus) with a copy button when the clipboard is available. */
export function CopyUrlField({ url, label, hint, copiedMessage }: CopyUrlFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  // Only in secure contexts (https or localhost): on a plain-http LAN install the field stays selectable.
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(copiedMessage);
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          readOnly
          value={url}
          aria-describedby={`${id}-hint`}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 basis-64 font-mono text-sm"
        />
        {canCopy && (
          <Button type="button" variant="default" onClick={copy}>
            <Copy aria-hidden />
            {t('common.copy')}
          </Button>
        )}
      </div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
