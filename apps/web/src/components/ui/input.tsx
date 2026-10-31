import type * as React from 'react';
import { useFormFieldControl } from '@/components/form-field-context';
import { cn } from '@/lib/utils';

export const fieldClassName =
  'flex min-h-11 w-full rounded-md border bg-card px-4 py-2 text-[0.9375rem] text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-invalid:border-destructive';

export function Input({ className, ...rest }: React.ComponentProps<'input'>) {
  const props = useFormFieldControl(rest);
  return <input className={cn(fieldClassName, className)} {...props} />;
}
