import type { Locator, Page } from '@playwright/test';
import { createVehicle, expect, t, test, uniquePlate } from './fixtures';

// The lists of the vehicle page share their badge column (`badgeListClassName`): on desktop every
// title starts at the same x whatever the length of its badge; on phones the badge keeps its own line.

/** The card of a list: its title is the `h2` of the card header. */
function card(page: Page, titleKey: string): Locator {
  return page.getByRole('heading', { level: 2, name: t(titleKey), exact: true }).locator('../..');
}

/** Left edge of the title of every row of `list`. */
function titleXs(list: Locator): Promise<number[]> {
  return list
    .getByRole('listitem')
    .evaluateAll((rows) =>
      rows.map((row) => Math.round(row.querySelector('strong')?.getBoundingClientRect().left ?? Number.NaN)),
    );
}

test('lines up the titles of each list of the vehicle page', async ({ page }, testInfo) => {
  const vehicle = await createVehicle(page.request, {
    make: 'Seat',
    model: 'León',
    plate: uniquePlate(testInfo),
  });
  const base = `/api/vehicles/${vehicle.id}`;
  const post = async (url: string, data: object) => {
    const response = await page.request.post(`${base}${url}`, { data });
    expect(response.status(), await response.text()).toBe(201);
  };
  // Short and long labels in every list; maintenance spans two years (two groups).
  await post('/odometer', { date: '2025-01-10', value: 10_000 });
  await post('/maintenance', {
    date: '2025-03-01',
    odometer: 12_000,
    category: 'oil_change',
    title: 'Cambio de aceite',
    cost: 80,
  });
  await post('/maintenance', {
    date: '2025-09-01',
    odometer: 19_000,
    category: 'tires',
    title: 'Neumáticos delanteros',
    cost: 230,
  });
  await post('/maintenance', {
    date: '2026-02-01',
    odometer: 23_000,
    category: 'brakes',
    title: 'Pastillas de freno',
    cost: 140,
  });
  await post('/fuel-logs', {
    date: '2026-06-01',
    odometer: 27_000,
    quantity: 40,
    totalPrice: 60,
    fullTank: true,
  });
  await post('/fuel-logs', {
    date: '2026-07-01',
    odometer: 27_600,
    quantity: 20,
    totalPrice: 31,
    fullTank: false,
  });
  await post('/odometer', { date: '2026-09-01', value: 29_000 });
  await post('/expenses', {
    date: '2026-01-15',
    category: 'tax',
    title: 'Impuesto de circulación',
    cost: 95,
  });
  await post('/expenses', { date: '2026-04-15', category: 'tolls', title: 'Peaje', cost: 15.6 });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/vehicles/${vehicle.id}`);
  const lists = {
    'odometer.title': 7,
    'fuel.title': 2,
    'expenses.title': 2,
    'maintenance.title': 3,
  };
  for (const [titleKey, count] of Object.entries(lists)) {
    const rows = card(page, titleKey).getByRole('listitem');
    await expect(rows).toHaveCount(count);
    const xs = await titleXs(card(page, titleKey));
    expect(new Set(xs), `${titleKey}: ${xs.join(', ')}`).toHaveProperty('size', 1);
  }

  // Phones: the badge sits on its own line, above the title.
  await page.setViewportSize({ width: 412, height: 915 });
  for (const titleKey of ['fuel.title', 'expenses.title', 'maintenance.title']) {
    const rows = await card(page, titleKey)
      .getByRole('listitem')
      .evaluateAll((items) =>
        items.map((row) => {
          const badge = row.querySelector('span')?.getBoundingClientRect();
          const title = row.querySelector('strong')?.getBoundingClientRect();
          return badge !== undefined && title !== undefined && badge.bottom <= title.top;
        }),
      );
    expect(rows, titleKey).not.toContain(false);
  }
});
