/**
 * What the Android back button does in the native app, without Capacitor (`BackButtonHandler` wires it to
 * the plugin): close the top layer, else go back in the router, else send the app to the background.
 */

/**
 * Screens where back never navigates: the dashboard (both modes), the mode choice and the login. After
 * logging out or changing the server the history still holds the screens of the old session; back on
 * `/login` must not walk through them.
 */
export const ROOT_PATHS: ReadonlySet<string> = new Set(['/', '/welcome', '/login']);

/**
 * Sends a cancelable Escape `keydown` to the focused element (or `body`) and returns whether a Radix layer
 * took it. Only the top layer listens (in capture, on `document`) and it always cancels the event, whether
 * it closes or refuses to (a form that is saving): so `true` means there was an open layer.
 */
export function closeTopLayer(doc: Document = document): boolean {
  const target = doc.activeElement ?? doc.body;
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  return !target.dispatchEvent(event);
}

export type BackAction = 'layer' | 'back' | 'minimize';

export interface BackContext {
  /** Closes the top layer, if any; true when there was one (`closeTopLayer`). */
  closeTopLayer(): boolean;
  pathname: string;
  /** Whether the router history has a previous entry. */
  canGoBack: boolean;
}

/**
 * Decides what a back press does and closes the top layer when that is the answer: `layer` (a layer took
 * it), `back` (go back in the router) or `minimize` (send the app to the background). The caller runs
 * `back` and `minimize`. The mode (server or local) does not matter.
 */
export function resolveBack(ctx: BackContext): BackAction {
  if (ctx.closeTopLayer()) return 'layer';
  if (!ROOT_PATHS.has(ctx.pathname) && ctx.canGoBack) return 'back';
  return 'minimize';
}
