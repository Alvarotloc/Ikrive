import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';

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

  it('links the error to its input with aria-describedby and aria-invalid', () => {
    render(
      <FormField id="plate" label="Matrícula" error="La matrícula es obligatoria">
        <Input id="plate" />
      </FormField>,
    );

    const input = screen.getByLabelText('Matrícula');
    expect(input).toHaveAccessibleDescription('La matrícula es obligatoria');
    expect(input).toBeInvalid();
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('keeps the control own description next to the error', () => {
    render(
      <FormField id="fuel-total" label="Importe" error="Importe no válido">
        <Input id="fuel-total" aria-describedby="fuel-total-hint" />
        <p id="fuel-total-hint">Calculado</p>
      </FormField>,
    );

    expect(screen.getByLabelText('Importe')).toHaveAccessibleDescription('Calculado Importe no válido');
  });

  it('references no missing id without an error', () => {
    render(
      <>
        <FormField id="plate" label="Matrícula">
          <Input id="plate" />
        </FormField>
        <FormField id="odometer" label="Kilómetros">
          <Input id="odometer" aria-describedby="odometer-hint" />
          <p id="odometer-hint">Última lectura: 1000 km</p>
        </FormField>
      </>,
    );

    const plate = screen.getByLabelText('Matrícula');
    expect(plate).not.toHaveAttribute('aria-describedby');
    expect(plate).not.toHaveAttribute('aria-invalid');
    expect(plate).toHaveAccessibleDescription('');

    const odometer = screen.getByLabelText('Kilómetros');
    expect(odometer).toHaveAttribute('aria-describedby', 'odometer-hint');
    expect(odometer).toHaveAccessibleDescription('Última lectura: 1000 km');
  });

  it('links the error when the input is wrapped in another element', () => {
    render(
      <FormField id="odometer" label="Kilómetros" error="Lectura no válida">
        <div className="relative">
          <Input id="odometer" />
          <span>km</span>
        </div>
      </FormField>,
    );

    expect(screen.getByLabelText('Kilómetros')).toHaveAccessibleDescription('Lectura no válida');
  });

  it('links the error to selects and textareas too', () => {
    render(
      <>
        <FormField id="type" label="Tipo" error="Elige un tipo">
          <Select id="type">
            <option value="car">Coche</option>
          </Select>
        </FormField>
        <FormField id="notes" label="Notas" error="Demasiado largo">
          <Textarea id="notes" />
        </FormField>
      </>,
    );

    expect(screen.getByLabelText('Tipo')).toHaveAccessibleDescription('Elige un tipo');
    expect(screen.getByLabelText('Notas')).toHaveAccessibleDescription('Demasiado largo');
  });

  it('only links the control whose id matches the field', () => {
    render(
      <FormField id="plate" label="Matrícula" error="La matrícula es obligatoria">
        <Input id="plate" />
        <Input id="other" aria-label="Otro" />
      </FormField>,
    );

    const other = screen.getByLabelText('Otro');
    expect(other).not.toHaveAttribute('aria-describedby');
    expect(other).not.toHaveAttribute('aria-invalid');
  });

  it('gives each field a distinct error id', () => {
    render(
      <>
        <FormField id="email" label="Email" error="Email no válido">
          <Input id="email" />
        </FormField>
        <FormField id="password" label="Contraseña" error="Demasiado corta">
          <Input id="password" />
        </FormField>
      </>,
    );

    const [first, second] = screen.getAllByRole('alert');
    expect(first?.id).not.toBe(second?.id);
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email no válido');
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Demasiado corta');
  });
});
