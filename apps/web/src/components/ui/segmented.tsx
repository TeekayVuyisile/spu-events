import { cn } from '@/lib/utils';

/**
 * A row of toggle buttons where exactly one is pressed (filters, periods).
 * Buttons are 36px tall to fit the pill, with a 44px hit area (`hit-44`).
 */
export function Segmented<T>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-1 rounded-lg bg-muted p-1', className)}
    >
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'hit-44 h-9 cursor-pointer rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
            o.value === value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
