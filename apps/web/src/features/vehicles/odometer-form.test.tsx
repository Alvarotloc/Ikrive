import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { mockApi, renderWithProviders } from '@/test/render';
import { OdometerForm } from './odometer-form';

const vehicle = { id: 'v1', odometer: { value: 50_000, date: '2026-01-10' } };

describe('OdometerForm', () => {
  it('shows the backwards-odometer error on the field when the API answers 409', async () => {
    const fetchMock = mockApi({
      'POST /vehicles/v1/odometer': {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'The odometer cannot go backwards: there is a reading of 50000 on 2026-01-10',
        },
      },
    });
    const { user } = renderWithProviders(<OdometerForm vehicle={vehicle} label="Kilometraje" />);

    const input = screen.getByLabelText('Kilometraje');
    await user.type(input, '40000');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('odometer.errors.backwards'));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const request = fetchMock.mock.calls
      .map(([input, init]) => ({ url: String(input), init }))
      .find(({ url, init }) => url === '/api/vehicles/v1/odometer' && init?.method === 'POST');
    expect(JSON.parse(String(request?.init?.body))).toMatchObject({ value: 40_000 });
  });
});
