import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** 44px tall, 16px text (stops iOS zooming on focus), red border when aria-invalid. */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-base transition-colors placeholder:text-muted-foreground/70 hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-base transition-colors hover:border-primary/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
