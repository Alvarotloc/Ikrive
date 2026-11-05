import { createVehicle, expect, literal, t, test, uniquePlate } from './fixtures';

const refuels = [
  { date: '2026-10-01', odometer: '10000', quantity: '40', totalPrice: '60' },
  { date: '2026-10-15', odometer: '10500', quantity: '30', totalPrice: '45' },
];

test('adds two full-tank fuel logs and shows the average consumption', async ({ page }, testInfo) => {
  const vehicle = await createVehicle(page.request, {
    make: 'Renault',
    model: 'Clio',
    plate: uniquePlate(testInfo),
  });
  await page.goto(`/vehicles/${vehicle.id}`);
  const consumption = page.getByText(t('stats.metrics.consumption'), { exact: true }).locator('..');
  await expect(consumption).toContainText(t('stats.pending.consumption'));

  for (const refuel of refuels) {
    await page.getByRole('button', { name: t('fuel.add') }).click();
    const form = page.getByRole('dialog', { name: t('fuel.add') });
    await form.getByLabel(t('fuel.fields.odometer', { unit: 'km' })).fill(refuel.odometer);
    await form.getByLabel(t('fuel.fields.quantity', { unit: 'L' })).fill(refuel.quantity);
    await form.getByLabel(t('fuel.fields.totalPrice', { currency: 'EUR' })).fill(refuel.totalPrice);
    await expect(form.getByLabel(t('fuel.fields.fullTank'))).toBeChecked();
    await form.getByLabel(t('fuel.fields.date')).fill(refuel.date);
    await form.getByRole('button', { name: t('common.save') }).click();
    await expect(form).toBeHidden();
  }

  const editLabel = new RegExp(`^${literal(t('fuel.editLabel', { date: '' }))}`);
  await expect(page.getByRole('button', { name: editLabel })).toHaveCount(2);
  // 30 L over 500 km.
  await expect(consumption).toContainText('6 L/100 km');
  await expect(consumption).not.toContainText(t('stats.pending.consumption'));
});
