import { DEFAULT_USER_SETTINGS, type Vehicle } from '@ikrive/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type MockRoutes, mockApi, mockObjectUrls, renderWithProviders, setServerMode } from '@/test/render';
import { VehicleCard } from './vehicle-card';

const car: Vehicle = {
  id: 'v1',
  name: null,
  make: 'Toyota',
  model: 'Corolla',
  version: '1.8 Hybrid Active Tech',
  year: 2021,
  plate: '4821 LKP',
  vin: null,
  type: 'car',
  fuelType: 'hybrid',
  purchaseDate: null,
  purchasePrice: null,
  purchaseOdometer: null,
  notes: null,
  soldAt: null,
  archivedAt: null,
  status: 'active',
  photoUrl: null,
  odometer: { value: 50_040, date: '2026-11-01' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** The card on `/` of an in-memory router, with the detail route its link points to. */
async function setup(vehicle: Partial<Vehicle> = {}, routes: MockRoutes = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <VehicleCard vehicle={{ ...car, ...vehicle }} />,
      }),
      createRoute({ getParentRoute: () => rootRoute, path: '/vehicles/$vehicleId' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  renderWithProviders(<RouterProvider router={router} />);
  const card = await screen.findByRole('link', { name: /Toyota Corolla/ });
  return Object.assign(card, { fetchMock });
}

describe('VehicleCard', () => {
  it('truncates a long plate inside the card and keeps the full plate as its tooltip', async () => {
    const plate = 'PLACA-DE-PRUEBA-MUY-LARGA-1234567890';
    const card = await setup({ plate });

    const chip = screen.getByText(plate);
    expect(chip).toHaveAttribute('title', plate);
    // Cut with an ellipsis and never wider than half of the header row, so it cannot leave the card.
    expect(chip).toHaveClass('truncate', 'min-w-0', 'max-w-[50%]');
    // Every box from the header row up to the card may shrink below its content's width (grid and flex
    // items default to `min-width: auto`), so the card keeps the width of its column instead of growing.
    expect(card).toHaveClass('overflow-hidden');
    const boxes: HTMLElement[] = [];
    for (let box = chip.parentElement; box; box = box.parentElement) {
      boxes.push(box);
      if (box === card) break;
    }
    expect(boxes.at(-1)).toBe(card);
    for (const box of boxes) expect(box).toHaveClass('min-w-0');
    expect(card).toHaveAttribute('href', '/vehicles/v1');
  });

  it('shows no plate chip when the vehicle has no plate', async () => {
    const card = await setup({ plate: null });

    expect(card).toHaveTextContent('50.040 km');
    expect(card.querySelector('[title]')).toBeNull();
  });

  it('server mode: shows the photo loaded with the token', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    mockObjectUrls();
    const photoUrl = '/api/vehicles/v1/photo?v=2';
    const card = await setup(
      { photoUrl },
      { 'GET /vehicles/v1/photo': { body: new Blob(['jpeg'], { type: 'image/jpeg' }) } },
    );

    await waitFor(() => expect(card.querySelector('img')).toHaveAttribute('src', 'blob:1'));
    const photoRequest = card.fetchMock.mock.calls
      .map(([input, init]) => new Request(String(input), init))
      .find((request) => request.url.includes('/photo'));
    expect(photoRequest?.url).toBe(`https://ikrive.example.com${photoUrl}`);
    expect(photoRequest?.headers.get('authorization')).toBe('Bearer secret-token');
  });
});
