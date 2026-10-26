import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface InfoPopoverProps {
  /** Accessible name of the trigger, e.g. «Más información sobre la hora de los recordatorios». */
  label: string;
  children: ReactNode;
}

/** Info icon that opens an explanation on click or tap (a hover tooltip would not work on phones). */
export function InfoPopover({ label, children }: InfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-my-2 size-8 text-muted-foreground hover:text-foreground"
          aria-label={label}
        >
          <Info aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={label} className="p-4 text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
