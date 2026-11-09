import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Highlighted, non-blocking notice: privacy limits of the sale report, a local `BASE_URL`, an `http:` server. */
export function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-lg bg-warning/15 p-3 text-sm text-foreground">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>{children}</span>
    </p>
  );
}
