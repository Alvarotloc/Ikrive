import { isNativeApp } from './platform';
import { useMediaQuery } from './use-media-query';

/**
 * A touch screen as the main pointer: phones and tablets. Describes the device better than the width, so a
 * narrow desktop window gets no camera button.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * Whether the device can take a photo with `<input capture>`: the native app, or a touch device on the web.
 * On a desktop `capture` does nothing different from choosing a file, so the camera button is hidden there.
 */
export function useCanCapture(): boolean {
  // Always called, so the hooks keep their order whatever `isNativeApp()` returns.
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  return coarsePointer || isNativeApp();
}
