import type { ScanResult, ScanResultKind } from '@monthati/shared';
import { CircleCheck, CircleX, Clock, TriangleAlert, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { duration, ease, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Auto-dismiss delay (gate-scanner.md). */
export const RESULT_MS = 2500;

const looks: Record<
  ScanResultKind,
  { label: string; icon: LucideIcon; fill: string; text: string; vibrate: number[] }
> = {
  admitted: {
    label: 'Admit',
    icon: CircleCheck,
    fill: 'bg-success',
    text: 'text-[#03140a]',
    vibrate: [60],
  },
  already_used: {
    label: 'Already used',
    icon: TriangleAlert,
    fill: 'bg-warning',
    text: 'text-[#1a1000]',
    vibrate: [80, 60, 80],
  },
  invalid: {
    label: 'Invalid ticket',
    icon: CircleX,
    fill: 'bg-destructive',
    text: 'text-[#1a0505]',
    vibrate: [80, 60, 80],
  },
  wrong_event: {
    label: 'Wrong event',
    icon: CircleX,
    fill: 'bg-destructive',
    text: 'text-[#1a0505]',
    vibrate: [80, 60, 80],
  },
  cancelled: {
    label: 'Cancelled ticket',
    icon: CircleX,
    fill: 'bg-destructive',
    text: 'text-[#1a0505]',
    vibrate: [80, 60, 80],
  },
  not_open: {
    label: 'Gates closed',
    icon: Clock,
    fill: 'bg-warning',
    text: 'text-[#1a1000]',
    vibrate: [80, 60, 80],
  },
};

/**
 * Signature moment 3 (MASTER.md §5): the result colour fills the screen, a light
 * ripple spreads from the scanner frame outward, the icon pops in, and the phone buzzes.
 *
 * The colour is painted on the overlay itself, not by the animation: if animation
 * frames stall (backgrounded tab, power saving, some in-app browsers) the result
 * must still be readable at a glance. The ripple is decoration only.
 */
export function ScanResultOverlay({
  result,
  onDismiss,
}: {
  result: ScanResult;
  onDismiss: () => void;
}) {
  const look = looks[result.result];
  const Icon = look.icon;

  useEffect(() => {
    navigator.vibrate?.(look.vibrate);
    const id = setTimeout(onDismiss, RESULT_MS);
    return () => clearTimeout(id);
  }, [look, onDismiss]);

  return (
    <motion.button
      type="button"
      onClick={onDismiss}
      aria-label={`${look.label}. Tap to scan the next ticket.`}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: duration.fast }}
      className={cn('fixed inset-0 z-50 cursor-pointer overflow-hidden', look.fill, look.text)}
    >
      <motion.span
        aria-hidden
        className="absolute top-[45%] left-1/2 size-[300vmax] -translate-1/2 rounded-full bg-white"
        initial={{ scale: 0.04, opacity: 0.45 }}
        animate={{ scale: 1, opacity: 0 }}
        transition={{ duration: duration.slow, ease: ease.out }}
      />
      <span className="relative flex size-full flex-col items-center justify-center gap-4 p-8 text-center">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...spring.pop, delay: 0.08 }}
        >
          <Icon className="size-24" strokeWidth={2} aria-hidden />
        </motion.span>
        {/* Announced immediately: the gate staff may not be looking at the screen. */}
        <span role="alert" className="space-y-3">
          <span className="block font-display text-[2rem] leading-tight font-extrabold">
            {look.label}
          </span>
          {result.ticket && result.result !== 'invalid' && (
            <span className="block text-xl font-semibold">{result.ticket.holderName}</span>
          )}
          <span className="block text-lg opacity-80">
            {result.result === 'admitted' ? result.ticket?.code : result.message}
          </span>
        </span>
        <span className="absolute bottom-10 text-sm opacity-70">Tap to scan the next ticket</span>
      </span>
    </motion.button>
  );
}
