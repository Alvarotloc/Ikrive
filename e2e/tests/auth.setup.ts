import { ADMIN_STORAGE_STATE, expect, t, test } from './fixtures';

const admin = { name: 'Admin E2E', email: 'admin@e2e.test', password: 'e2e-password-123' };

test('registers the first user as admin', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel(t('auth.name')).fill(admin.name);
  await page.getByLabel(t('auth.email')).fill(admin.email);
  await page.getByLabel(t('auth.password')).fill(admin.password);
  await page.getByRole('button', { name: t('auth.register') }).click();

  await expect(page).toHaveURL('/');
  const usersLink = page.getByRole('link', { name: t('nav.users') });
  await expect(usersLink).toBeVisible();

  await usersLink.click();
  await expect(page).toHaveURL('/admin/users');
  const row = page.getByRole('listitem').filter({ hasText: admin.email });
  // The role selector of the account is on «Administrador».
  const role = row.getByLabel(t('adminUsers.roleLabel', { name: admin.name }));
  await expect(role).toHaveValue('admin');

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
