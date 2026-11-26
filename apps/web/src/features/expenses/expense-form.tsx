import { zodResolver } from '@hookform/resolvers/zod';
import { DEFAULT_USER_SETTINGS, EXPENSE_CATEGORIES, type Expense } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { settingsQuery } from '@/features/settings/queries';
import { todayIso } from '@/lib/format';
import {
  defaultsFrom,
  type ExpenseFormInput,
  type ExpenseFormValues,
  expenseFormSchema,
  formErrorFor,
} from './form';
import { useCreateExpense, useUpdateExpense } from './queries';

interface ExpenseFormDialogProps {
  vehicleId: string;
  /** Expense being edited; omit to create a new one. */
  expense?: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create or edit an expense in a dialog. */
export function ExpenseFormDialog({ vehicleId, expense, open, onOpenChange }: ExpenseFormDialogProps) {
  const { t } = useTranslation();
  // While saving, Escape, outside clicks and Cancel are ignored.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (next || !busy) && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
        <DialogTitle>{expense ? t('expenses.edit') : t('expenses.add')}</DialogTitle>
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <ExpenseForm
          vehicleId={vehicleId}
          expense={expense}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  vehicleId,
  expense,
  onBusyChange,
  onDone,
}: {
  vehicleId: string;
  expense: Expense | undefined;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { data: settings = DEFAULT_USER_SETTINGS } = useQuery(settingsQuery);
  const create = useCreateExpense(vehicleId);
  const update = useUpdateExpense(vehicleId);
  const form = useForm<ExpenseFormInput, unknown, ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: defaultsFrom(expense),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => onBusyChange(isSubmitting), [isSubmitting, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const field = (name: keyof ExpenseFormInput) => ({
    id: `expense-${name}`,
    label: t(`expenses.fields.${name}`, { currency: settings.currency }),
    error: errors[name]?.message,
  });
  const input = (name: keyof ExpenseFormInput) => ({
    id: `expense-${name}`,
    'aria-invalid': Boolean(errors[name]),
    ...form.register(name),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (expense) await update.mutateAsync({ expenseId: expense.id, changes: values });
      else await create.mutateAsync(values);
    } catch (cause) {
      const error = formErrorFor(cause);
      form.setError(error.field, { message: t(error.messageKey) });
      return;
    }
    toast.success(t(expense ? 'expenses.updated' : 'expenses.created'));
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <FormField {...field('date')}>
          <Input type="date" max={todayIso()} {...input('date')} />
        </FormField>
        <FormField {...field('cost')}>
          <Input inputMode="decimal" autoComplete="off" {...input('cost')} />
        </FormField>
      </div>
      <FormField {...field('category')}>
        <Select {...input('category')}>
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`expenses.categories.${category}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField {...field('title')}>
        <Input autoComplete="off" {...input('title')} />
      </FormField>
      <FormField {...field('description')}>
        <Textarea {...input('description')} />
      </FormField>
      {errors.root && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
