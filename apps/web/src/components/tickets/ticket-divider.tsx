import { motion } from 'motion/react';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Perforated divider with half-circle punches at both edges. Unlike the
 * `ticket-notch` mask it needs no measured offset, so it stays aligned however
 * tall the content above it grows. The parent card must be `overflow-hidden`.
 */
export function TicketDivider({
  drawIn = false,
  className,
}: {
  drawIn?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn('relative h-6', className)}>
      <span className="absolute top-0 -left-3 size-6 rounded-full border bg-background" />
      <motion.div
        className="perforation absolute inset-x-5 top-1/2 origin-left -translate-y-1/2"
        initial={drawIn ? { scaleX: 0 } : false}
        animate={{ scaleX: 1 }}
        transition={{ duration: duration.slow, ease: ease.out, delay: 0.5 }}
      />
      <span className="absolute top-0 -right-3 size-6 rounded-full border bg-background" />
    </div>
  );
}
