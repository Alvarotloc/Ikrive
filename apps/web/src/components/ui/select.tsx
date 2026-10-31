import type * as React from 'react';
import { useFormFieldControl } from '@/components/form-field-context';
import { cn } from '@/lib/utils';
import { fieldClassName } from './input';

/** Native select styled like the other inputs: accessible and mobile-friendly. */
export function Select({ className, ...rest }: React.ComponentProps<'select'>) {
  const props = useFormFieldControl(rest);
  return <select className={cn(fieldClassName, 'cursor-pointer', className)} {...props} />;
}
