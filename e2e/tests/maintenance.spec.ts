import { createVehicle, expect, PNG_8x8, t, test, uniquePlate } from './fixtures';

test('adds a maintenance record with an attachment', async ({ page }, testInfo) => {
  const vehicle = await createVehicle(page.request, {
    make: 'Toyota',
    model: 'Corolla',
    plate: uniquePlate(testInfo),
  });
  const title = 'Cambio de aceite E2E';
  await page.goto(`/vehicles/${vehicle.id}`);

  await page.getByRole('button', { name: t('maintenance.add') }).click();
  const form = page.getByRole('dialog', { name: t('maintenance.add') });
  await form.getByLabel(t('maintenance.fields.date')).fill('2026-10-01');
  await form.getByLabel(t('maintenance.fields.title')).fill(title);
  await form.getByLabel(t('maintenance.fields.cost', { currency: 'EUR' })).fill('89,90');
  await form
    .getByLabel(t('maintenance.attachments.fileInput'))
    .setInputFiles({ name: 'factura.png', mimeType: 'image/png', buffer: PNG_8x8 });
  await expect(form.getByText('factura.png', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: t('common.save') }).click();
  await expect(form).toBeHidden();

  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: t('maintenance.attachments.open', { title }) }).click();
  const invoices = page.getByRole('dialog', { name: t('maintenance.attachments.title') });
  await expect(
    invoices.getByRole('button', { name: t('maintenance.attachments.view', { name: 'factura.png' }) }),
  ).toBeVisible();
});
