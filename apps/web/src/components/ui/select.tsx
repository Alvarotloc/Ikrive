import type * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClassName } from './input';

/** Native select styled like the other inputs: accessible and mobile-friendly. */
export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(fieldClassName, 'cursor-pointer', className)} {...props} />;
}
