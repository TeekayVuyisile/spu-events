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

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-32 w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-base leading-relaxed transition-colors placeholder:text-muted-foreground/70 hover:border-primary/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

/** Checkbox with its label as one 44px-tall click target. */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label: string; hint?: string }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-2', className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
        {...props}
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
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
