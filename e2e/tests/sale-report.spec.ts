import { readFile } from 'node:fs/promises';
import { createVehicle, expect, t, test, uniquePlate } from './fixtures';

test('downloads the sale report pdf', async ({ page }, testInfo) => {
  const vehicle = await createVehicle(page.request, {
    make: 'Volkswagen',
    model: 'Golf',
    plate: uniquePlate(testInfo),
  });
  await page.goto(`/vehicles/${vehicle.id}`);

  await page.getByRole('button', { name: t('saleReport.button') }).click();
  const dialog = page.getByRole('dialog', { name: t('saleReport.title') });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: t('saleReport.download') }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const content = await readFile(await download.path());
  expect(content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
});
