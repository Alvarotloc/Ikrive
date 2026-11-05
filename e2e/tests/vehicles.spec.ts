import { expect, t, test, uniquePlate } from './fixtures';

test('creates a vehicle from the form', async ({ page }, testInfo) => {
  const plate = uniquePlate(testInfo);
  await page.goto('/vehicles/new');
  await page.getByLabel(t('vehicles.fields.make')).fill('Seat');
  await page.getByLabel(t('vehicles.fields.model')).fill('León');
  await page.getByLabel(t('vehicles.fields.plate')).fill(plate);
  await page.getByRole('button', { name: t('vehicles.add') }).click();

  await expect(page).toHaveURL(/\/vehicles\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Seat León' })).toBeVisible();
  await expect(page.getByText(plate, { exact: true })).toBeVisible();

  await page.goto('/vehicles');
  // `.first()`: a data import running in parallel may duplicate every vehicle of the shared admin.
  await expect(page.getByText(plate, { exact: true }).first()).toBeVisible();
});
