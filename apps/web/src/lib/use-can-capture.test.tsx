import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockMediaQuery } from '@/test/render';
import { useCanCapture } from './use-can-capture';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('useCanCapture', () => {
  it('is true on a coarse pointer', () => {
    mockMediaQuery(true);
    expect(renderHook(() => useCanCapture()).result.current).toBe(true);
  });

  it('is false on a fine pointer on the web', () => {
    mockMediaQuery(false);
    expect(renderHook(() => useCanCapture()).result.current).toBe(false);
  });

  it('is true in the native app with a fine pointer', () => {
    vi.stubEnv('MODE', 'native');
    mockMediaQuery(false);
    expect(renderHook(() => useCanCapture()).result.current).toBe(true);
  });
});
