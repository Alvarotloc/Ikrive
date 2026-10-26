import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  /** Rendered next to the label, e.g. an `InfoPopover`. */
  labelAction?: ReactNode;
  children: ReactNode;
}

export function FormField({ id, label, error, labelAction, children }: FormFieldProps) {
  return (
    <div className="grid gap-2">
      {labelAction ? (
        <div className="flex items-center gap-1">
          <Label htmlFor={id}>{label}</Label>
          {labelAction}
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      {children}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
