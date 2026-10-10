import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { duration, ease } from '@/lib/motion';
import { useTheme } from './theme-context';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} title={label}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -45 }}
          animate={{ opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, rotate: 45 }}
          transition={{ duration: duration.fast, ease: ease.out }}
          className="flex"
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}
