import { useCallback, useSyncExternalStore } from 'react';

/** Same breakpoint as Tailwind's `md:` (48rem). Keep both in sync if `md` ever changes in `index.css`. */
export const DESKTOP_QUERY = '(min-width: 48rem)';

/** Whether `query` matches now; re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
