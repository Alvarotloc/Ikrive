import type * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClassName } from './input';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClassName, 'min-h-28 resize-y py-3 leading-relaxed', className)} {...props} />;
}
