import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Loading placeholder; shape it like the content it stands in for. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
  );
}
