import { Check } from 'lucide-react';

/** Mint check bullet with a title and short description ("proof items" on the landing). */
export function CheckItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <Check className="size-3" strokeWidth={2.5} aria-hidden />
      </span>
      <div>
        <strong className="block text-sm font-semibold">{title}</strong>
        <span className="mt-0.5 block text-[0.8125rem] leading-normal opacity-75">{description}</span>
      </div>
    </div>
  );
}
