import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';
import { Input } from './ui/input';

describe('FormField', () => {
  it('shows its error with role="alert"', () => {
    render(
      <FormField id="plate" label="Matrícula" error="La matrícula es obligatoria">
        <Input id="plate" />
      </FormField>,
    );

    expect(screen.getByLabelText('Matrícula')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('La matrícula es obligatoria');
  });

  it('renders no alert without an error', () => {
    render(
      <FormField id="plate" label="Matrícula">
        <Input id="plate" />
      </FormField>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
