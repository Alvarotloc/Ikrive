import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const overlayClassName =
  'fixed inset-0 z-50 bg-deep/40 backdrop-blur-[2px]';
const contentClassName =
  'fixed top-1/2 left-1/2 z-50 grid min-w-0 w-[calc(100%-2rem)] max-w-md grid-cols-[minmax(0,1fr)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border bg-card p-7 text-card-foreground shadow-float focus:outline-none';
// Long unbroken names (file names, vehicle titles…) must wrap instead of widening the dialog.
const titleClassName = 'min-w-0 text-xl font-bold tracking-[-0.02em] wrap-anywhere';
const descriptionClassName = 'min-w-0 leading-relaxed text-muted-foreground wrap-anywhere';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content className={cn(contentClassName, className)} {...props} />
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn(titleClassName, className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn(descriptionClassName, className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end', className)} {...props} />;
}

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={overlayClassName} />
      <AlertDialogPrimitive.Content className={cn(contentClassName, className)} {...props} />
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn(titleClassName, className)} {...props} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description className={cn(descriptionClassName, className)} {...props} />
  );
}
