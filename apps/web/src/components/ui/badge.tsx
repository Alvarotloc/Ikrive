import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full text-xs font-bold', {
  variants: {
    variant: {
      /** Mint pill with a status dot, e.g. "Historial al día". */
      status: 'bg-accent px-3 py-1.5 text-success before:size-2 before:rounded-full before:bg-current',
      /** Amber pill with a status dot, e.g. a maintenance due soon. */
      warning: 'bg-warning/15 px-3 py-1.5 text-warning before:size-2 before:rounded-full before:bg-current',
      /** Red pill with a status dot, e.g. an overdue maintenance. */
      danger:
        'bg-destructive/12 px-3 py-1.5 text-destructive before:size-2 before:rounded-full before:bg-current',
      /** Dashed outline stamp, e.g. "Factura", "Gasto". */
      stamp: 'border border-dashed border-foreground/35 px-2.5 py-1 tracking-[0.06em] text-foreground',
    },
  },
  defaultVariants: { variant: 'status' },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
