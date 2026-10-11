import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { duration, ease } from '@/lib/motion';

/**
 * A number that rolls to its new value when it changes (MASTER.md §5, moment 4–5).
 * The first render shows the value as-is; reduced motion skips the roll.
 */
export function RollingNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (n) => format(Math.round(n)));
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: duration.slow * 2, ease: ease.out });
    return () => controls.stop();
  }, [value, reduce, mv]);

  // The visible text animates; screen readers get the final value straight away.
  return (
    <>
      <motion.span aria-hidden className={className}>
        {text}
      </motion.span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
