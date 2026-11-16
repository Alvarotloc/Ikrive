// @vitest-environment jsdom
// closeTopLayer dispatches a keyboard event on the document: it needs a DOM, unlike the rest of the pure-logic tests.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type BackContext, closeTopLayer, resolveBack } from './back-button';

const context = (overrides: Partial<BackContext> = {}): BackContext => ({
  closeTopLayer: () => false,
  pathname: '/vehicles/v1',
  canGoBack: true,
  ...overrides,
});

describe('back button', () => {
  let remove: (() => void) | undefined;
  afterEach(() => {
    remove?.();
    remove = undefined;
  });

  /** A capture listener on `document`, like the one of the top Radix layer. */
  function listenEscape(handler: (event: KeyboardEvent) => void) {
    document.addEventListener('keydown', handler, true);
    remove = () => document.removeEventListener('keydown', handler, true);
  }

  it('closeTopLayer is true only when a capture listener prevents the Escape keydown', () => {
    expect(closeTopLayer()).toBe(false);

    const seen: string[] = [];
    listenEscape((event) => seen.push(event.key));
    expect(closeTopLayer()).toBe(false);
    remove?.();

    listenEscape((event) => {
      seen.push(event.key);
      if (event.key === 'Escape') event.preventDefault();
    });
    expect(closeTopLayer()).toBe(true);

    // Sent to the focused element, so it bubbles through it like a real key press.
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const onInput = vi.fn();
    input.addEventListener('keydown', onInput);
    expect(closeTopLayer(document)).toBe(true);
    expect(onInput).toHaveBeenCalledTimes(1);
    input.remove();

    expect(seen).toEqual(['Escape', 'Escape', 'Escape']);
  });

  it('prefers closing a layer over navigating', () => {
    const close = vi.fn(() => true);
    expect(resolveBack(context({ closeTopLayer: close }))).toBe('layer');
    expect(resolveBack(context({ closeTopLayer: close, pathname: '/' }))).toBe('layer');
    expect(resolveBack(context({ closeTopLayer: close, canGoBack: false }))).toBe('layer');
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('goes back outside the root screens when there is history', () => {
    for (const pathname of ['/vehicles', '/vehicles/v1', '/server', '/register', '/settings']) {
      expect(resolveBack(context({ pathname })), pathname).toBe('back');
    }
  });

  it('minimizes on the dashboard and the welcome screen even with history', () => {
    expect(resolveBack(context({ pathname: '/' }))).toBe('minimize');
    expect(resolveBack(context({ pathname: '/welcome' }))).toBe('minimize');
  });

  it('minimizes on the login screen even with history', () => {
    expect(resolveBack(context({ pathname: '/login' }))).toBe('minimize');
  });

  it('minimizes when there is no history', () => {
    expect(resolveBack(context({ canGoBack: false }))).toBe('minimize');
    expect(resolveBack(context({ pathname: '/', canGoBack: false }))).toBe('minimize');
  });
});
