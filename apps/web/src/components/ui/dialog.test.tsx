import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  DialogFooter,
} from './dialog';

// 255 characters without a single space, like a camera file name.
const longName = `JPEG_20261119_142310_${'7'.repeat(255 - 'JPEG_20261119_142310_'.length - '.jpg'.length)}.jpg`;

function renderDeleteDialog() {
  render(
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogTitle>¿Eliminar «{longName}»?</AlertDialogTitle>
        <AlertDialogDescription>Se borrará «{longName}» de forma permanente.</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction>Eliminar</AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );
}

describe('AlertDialog with long names', () => {
  it('uses a 255-character name without spaces', () => {
    expect(longName).toHaveLength(255);
    expect(longName).not.toMatch(/\s/);
  });

  it('lets the title and description break long words and shrink', () => {
    renderDeleteDialog();

    const title = screen.getByRole('heading', { name: `¿Eliminar «${longName}»?` });
    expect(title).toHaveClass('wrap-anywhere', 'min-w-0');
    expect(screen.getByText(`Se borrará «${longName}» de forma permanente.`)).toHaveClass('wrap-anywhere', 'min-w-0');
  });

  it('keeps the content within the viewport with a shrinkable single column', () => {
    renderDeleteDialog();

    const content = screen.getByRole('alertdialog');
    expect(content).toHaveClass('min-w-0', 'grid-cols-[minmax(0,1fr)]', 'w-[calc(100%-2rem)]', 'max-w-md');
  });

  it('keeps both buttons rendered inside a shrinkable footer', () => {
    renderDeleteDialog();

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Eliminar' });
    expect(cancel.parentElement).toHaveClass('min-w-0');
    expect(confirm.parentElement).toBe(cancel.parentElement);
  });
});
