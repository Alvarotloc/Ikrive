import { readFile } from 'node:fs/promises';
import { createVehicle, expect, t, test, uniquePlate } from './fixtures';

test('exports and re-imports the user data', async ({ page }, testInfo) => {
  const plate = uniquePlate(testInfo);
  await createVehicle(page.request, { make: 'Mazda', model: 'MX-5', plate });
  await page.goto('/settings');

  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: t('dataPortability.export') }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  // Saved under its own name: the import only accepts `.zip` files.
  const zip = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(zip);
  expect((await readFile(zip)).subarray(0, 2).toString('latin1')).toBe('PK');

  await page.getByLabel(t('dataPortability.fileInput')).setInputFiles(zip);
  await page
    .getByRole('alertdialog', { name: t('dataPortability.confirmTitle') })
    .getByRole('button', { name: t('dataPortability.confirm') })
    .click();
  await expect(page.getByRole('heading', { name: t('dataPortability.summaryTitle') })).toBeVisible();

  // The import adds to the account: the exported vehicle is now there twice.
  await page.goto('/vehicles');
  await expect(page.getByText(plate, { exact: true })).toHaveCount(2);
});
