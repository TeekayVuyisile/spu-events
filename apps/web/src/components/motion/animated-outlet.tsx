import { AnimatePresence, motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router';
import { fadeUp } from '@/lib/motion';

/**
 * Route-level page transition. Freezes the outgoing outlet so it can animate out
 * while the next page animates in.
 */
export function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
