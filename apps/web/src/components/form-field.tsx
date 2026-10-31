import { type ReactNode, useId } from 'react';
import { Label } from '@/components/ui/label';
import { FormFieldContext } from './form-field-context';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  /** Rendered next to the label, e.g. an `InfoPopover`. */
  labelAction?: ReactNode;
  children: ReactNode;
}

/**
 * Label + control + error. The error is linked to the control whose `id` matches `id`
 * (`Input`, `Select` and `Textarea` read it through `useFormFieldControl`).
 */
export function FormField({ id, label, error, labelAction, children }: FormFieldProps) {
  const errorId = `${useId()}-error`;
  const context = { controlId: id, errorId: error ? errorId : undefined };

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
      <FormFieldContext value={context}>{children}</FormFieldContext>
      {error && (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
