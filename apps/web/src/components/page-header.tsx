import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-2">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="text-3xl leading-[1.1] font-bold tracking-[-0.03em] sm:text-4xl">{title}</h1>
        {description && <p className="max-w-[52ch] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
