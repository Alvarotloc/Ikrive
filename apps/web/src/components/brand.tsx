import { cn } from '@/lib/utils';

/** Logo + lowercase "ikrive" wordmark, as on the landing. */
export function Brand({ className, showLogo = true }: { className?: string; showLogo?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {showLogo && <img src="/logo.png" alt="" className="size-8 rounded-md" width={32} height={32} />}
      <span className="font-display text-xl font-bold tracking-[-0.02em]">ikrive</span>
    </span>
  );
}
