import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, t, test } from '../tests/fixtures';
import { DEMO_USER, DEMO_VEHICLE, seedDemoData, signUpDemoUser } from './seed';

// README screenshots, run with `pnpm screenshots` (not part of `pnpm test:e2e`). Each test waits for
// the seeded content with web-first assertions before taking its screenshot.

const SCREENSHOTS_DIR = join(import.meta.dirname, '../../docs/screenshots');
/** Session of the demo user, written by `beforeAll` and loaded by every test. */
const STORAGE_STATE = join(import.meta.dirname, '../.auth/screenshots.json');

let vehicleId = '';

async function capture(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOTS_DIR, name), animations: 'disabled' });
}

/**
 * Captures the whole page by growing the viewport to its height instead of `fullPage`: the sidebar is
 * sticky and `100dvh` tall, so with `fullPage` its background would stop at the original viewport height.
 */
async function captureWholePage(page: Page, name: string) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('The screenshots project must set a viewport');
  const height = await page.locator('html').evaluate((html) => html.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height });
  const sidebar = page.locator('aside');
  await expect.poll(() => sidebar.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
  await capture(page, name);
}

test.describe
  .serial('readme screenshots', () => {
    test.use({ storageState: STORAGE_STATE });

    test.beforeAll(async ({ browser }) => {
      mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      const context = await browser.newContext({ storageState: undefined });
      await signUpDemoUser(context.request);
      const vehicle = await seedDemoData(context.request, new Date());
      vehicleId = vehicle.id;
      await context.storageState({ path: STORAGE_STATE });
      await context.close();
    });

    test('dashboard', async ({ page }) => {
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: t('dashboard.welcome', { name: DEMO_USER.name }) }),
      ).toBeVisible();
      await expect(page.getByText(DEMO_VEHICLE.model).first()).toBeVisible();
      await capture(page, 'dashboard.png');
    });

    test('vehicles', async ({ page }) => {
      await page.goto('/vehicles');
      await expect(page.getByRole('heading', { name: t('vehicles.title'), exact: true })).toBeVisible();
      await expect(page.getByText(DEMO_VEHICLE.model).first()).toBeVisible();
      await capture(page, 'vehicles.png');
    });

    test('vehicle detail', async ({ page }) => {
      await page.goto(`/vehicles/${vehicleId}`);
      await expect(page.getByText('Pastillas de freno', { exact: true })).toBeVisible();
      await expect(page.getByText(t('stats.metrics.consumption'), { exact: true })).toBeVisible();
      await captureWholePage(page, 'vehicle-detail.png');
    });

    test('vehicle stats', async ({ page }) => {
      await page.goto(`/vehicles/${vehicleId}`);
      const stats = page
        .locator('div')
        .filter({ has: page.getByRole('heading', { name: t('stats.title'), exact: true }) })
        .filter({ has: page.getByText(t('stats.metrics.consumption'), { exact: true }) })
        .last();
      await expect(
        stats.getByText(t('stats.metrics.consumption'), { exact: true }).locator('..'),
      ).toContainText('L/100 km');
      await stats.scrollIntoViewIfNeeded();
      await stats.screenshot({ path: join(SCREENSHOTS_DIR, 'vehicle-stats.png'), animations: 'disabled' });
    });

    test('settings', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: t('settings.title'), exact: true })).toBeVisible();
      await capture(page, 'settings.png');
    });

    test.describe('dark theme', () => {
      test.use({ colorScheme: 'dark' });

      test('vehicle detail', async ({ page }) => {
        await page.goto(`/vehicles/${vehicleId}`);
        await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        await expect(page.getByText('Pastillas de freno', { exact: true })).toBeVisible();
        await capture(page, 'vehicle-detail-dark.png');
      });
    });

    test.describe('mobile', () => {
      // `devices['Pixel 7']` minus `defaultBrowserType`, which cannot be set inside a describe.
      const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
      test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

      test('dashboard', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText(DEMO_VEHICLE.model).first()).toBeVisible();
        await capture(page, 'mobile-dashboard.png');
      });
    });
  });
