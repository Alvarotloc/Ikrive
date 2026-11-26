import type { Expense, Vehicle } from '@ikrive/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { useFormat } from '@/lib/format';
import { ExpenseFormDialog } from './expense-form';
import {
  availableExpenseCategories,
  type ExpenseCategoryFilter,
  expenseName,
  filterExpenses,
  resolveExpenseFilter,
  sortExpenses,
} from './expenses';
import { expensesQuery, useDeleteExpense } from './queries';

const chipClassName =
  'min-h-9 rounded-full border px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground';

/** Other expenses of a vehicle (insurance, taxes, tolls…), newest first: category filter, create, edit and delete. */
export function ExpensesSection({ vehicle }: { vehicle: Pick<Vehicle, 'id' | 'status'> }) {
  const { t } = useTranslation();
  const { data: expenses } = useSuspenseQuery(expensesQuery(vehicle.id));
  const [selected, setSelected] = useState<ExpenseCategoryFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense>();
  const categories = availableExpenseCategories(expenses);
  const filter = resolveExpenseFilter(selected, categories);
  // The selected category lost its last expense: go back to "all" for good.
  if (filter !== selected) setSelected(filter);

  const openForm = (expense?: Expense) => {
    setEditing(expense);
    setFormOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{t('expenses.title')}</CardTitle>
        {vehicle.status === 'active' && (
          <Button variant="accent" size="sm" onClick={() => openForm()}>
            <Plus aria-hidden />
            {t('expenses.add')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-5">
        {expenses.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t('expenses.empty')}</p>
        ) : (
          <>
            <nav className="flex flex-wrap gap-1" aria-label={t('expenses.filterLabel')}>
              {(['all', ...categories] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  className={chipClassName}
                  aria-pressed={filter === category}
                  onClick={() => setSelected(category)}
                >
                  {category === 'all' ? t('expenses.all') : t(`expenses.categories.${category}`)}
                </button>
              ))}
            </nav>
            <ol className="divide-y">
              {sortExpenses(filterExpenses(expenses, filter)).map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  vehicleId={vehicle.id}
                  expense={expense}
                  onEdit={() => openForm(expense)}
                />
              ))}
            </ol>
          </>
        )}
      </CardContent>
      <ExpenseFormDialog
        vehicleId={vehicle.id}
        expense={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </Card>
  );
}

function ExpenseRow({
  vehicleId,
  expense,
  onEdit,
}: {
  vehicleId: string;
  expense: Expense;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const name = expenseName(expense, t);
  const date = format.date(expense.date);

  // On phones the badge and the actions share the first line, so the text below keeps the full width.
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[auto_1fr_auto]">
      <Badge
        variant="stamp"
        className="col-start-1 row-start-1 min-w-20 justify-center justify-self-start uppercase sm:justify-self-auto"
      >
        {t(`expenses.categories.${expense.category}`)}
      </Badge>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <strong className="block font-semibold break-words">{name}</strong>
        <span className="text-sm break-words text-muted-foreground">
          {date} · {format.money(expense.cost)}
        </span>
      </div>
      <div className="col-start-2 row-start-1 flex sm:col-start-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onEdit}
          aria-label={t('expenses.editLabel', { name, date })}
        >
          <Pencil aria-hidden />
        </Button>
        <DeleteExpenseDialog vehicleId={vehicleId} expense={expense} name={name} date={date} />
      </div>
    </li>
  );
}

function DeleteExpenseDialog({
  vehicleId,
  expense,
  name,
  date,
}: {
  vehicleId: string;
  expense: Expense;
  name: string;
  date: string;
}) {
  const { t } = useTranslation();
  const remove = useDeleteExpense(vehicleId);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-destructive hover:text-destructive"
          aria-label={t('expenses.deleteLabel', { name, date })}
        >
          <Trash2 aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t('expenses.deleteTitle', { name, date })}</AlertDialogTitle>
        <AlertDialogDescription>{t('expenses.deleteDescription')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">{t('common.cancel')}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync(expense.id);
                  toast.success(t('expenses.deleted'));
                } catch {
                  toast.error(t('common.error'));
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
