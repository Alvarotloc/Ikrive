import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { overlayClassName } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Side panel on the right edge, built on the modal `Dialog` (focus trap, Escape, click outside). */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 border-l bg-card p-5 text-card-foreground shadow-float focus:outline-none',
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('font-display text-lg font-bold tracking-[-0.02em]', className)} {...props} />;
}
