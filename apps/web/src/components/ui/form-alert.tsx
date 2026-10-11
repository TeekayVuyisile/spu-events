import { CircleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { duration, ease } from '@/lib/motion';

/** Form-level error (wrong password, network down). Announced to screen readers. */
export function FormAlert({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.base, ease: ease.out }}
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-px size-5 shrink-0" aria-hidden />
          <p>{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
