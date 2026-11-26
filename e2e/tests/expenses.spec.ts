import { createVehicle, expect, literal, t, test, uniquePlate } from './fixtures';

const expenses = [
  { date: '2026-10-01', category: 'insurance', title: 'Seguro E2E', cost: '420' },
  // No title: the row is named after its category.
  { date: '2026-10-15', category: 'tolls', title: '', cost: '15,60' },
];

test('adds, filters and deletes an expense from the vehicle page', async ({ page }, testInfo) => {
  const vehicle = await createVehicle(page.request, {
    make: 'Peugeot',
    model: '208',
    plate: uniquePlate(testInfo),
  });
  await page.goto(`/vehicles/${vehicle.id}`);
  // The card of the section: the heading sits in its header.
  const section = page.getByRole('heading', { name: t('expenses.title'), exact: true }).locator('../..');
  await expect(section.getByText(t('expenses.empty'))).toBeVisible();

  for (const expense of expenses) {
    await section.getByRole('button', { name: t('expenses.add') }).click();
    const form = page.getByRole('dialog', { name: t('expenses.add') });
    await form.getByLabel(t('expenses.fields.date')).fill(expense.date);
    await form.getByLabel(t('expenses.fields.category')).selectOption(expense.category);
    await form.getByLabel(t('expenses.fields.title')).fill(expense.title);
    await form.getByLabel(t('expenses.fields.cost', { currency: 'EUR' })).fill(expense.cost);
    await form.getByRole('button', { name: t('common.save') }).click();
    await expect(form).toBeHidden();
  }

  const tolls = t('expenses.categories.tolls');
  const rows = section.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(tolls);
  await expect(rows.last()).toContainText('Seguro E2E');

  // Filter by one category.
  const filter = section.getByRole('navigation', { name: t('expenses.filterLabel') });
  await filter.getByRole('button', { name: tolls }).click();
  await expect(filter.getByRole('button', { name: tolls })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(1);
  await expect(section.getByText('Seguro E2E')).toBeHidden();

  // Both count in the total cost: 420 + 15,60.
  const total = page.getByText(t('stats.metrics.totalCost'), { exact: true }).locator('..');
  await expect(total).toContainText(/435,60\s€/);
  await expect(total).toContainText(/otros gastos 435,60\s€/);

  // Deleting the last toll goes back to «All».
  await section
    .getByRole('button', {
      name: new RegExp(`^${literal(t('expenses.deleteLabel', { name: tolls, date: '' }))}`),
    })
    .click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: t('common.delete') }).click();
  await expect(page.getByText(t('expenses.deleted'))).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Seguro E2E');
  await expect(filter.getByRole('button', { name: tolls })).toBeHidden();
  await expect(total).toContainText(/otros gastos 420,00\s€/);
});
