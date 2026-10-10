import type { Transition, Variants } from 'motion/react';

/** Motion tokens from design-system/MASTER.md §5. Import these instead of hand-rolling values. */
export const duration = { fast: 0.15, base: 0.22, slow: 0.32 } as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  in: [0.4, 0, 1, 1],
} as const;

export const spring = {
  snappy: { type: 'spring', stiffness: 400, damping: 32 },
  pop: { type: 'spring', stiffness: 500, damping: 18 },
} as const satisfies Record<string, Transition>;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
  exit: { opacity: 0, y: -8, transition: { duration: duration.fast, ease: ease.in } },
};

export const staggerChildren = (stagger = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});
