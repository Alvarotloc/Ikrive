import type * as React from 'react';
import { useFormFieldControl } from '@/components/form-field-context';
import { cn } from '@/lib/utils';
import { fieldClassName } from './input';

export function Textarea({ className, ...rest }: React.ComponentProps<'textarea'>) {
  const props = useFormFieldControl(rest);
  return <textarea className={cn(fieldClassName, 'min-h-28 resize-y py-3 leading-relaxed', className)} {...props} />;
}
