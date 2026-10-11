import { motion } from 'motion/react';
import { Link } from 'react-router';
import { AnimatedOutlet } from '@/components/motion/animated-outlet';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { duration, ease, spring } from '@/lib/motion';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold">
      <span aria-hidden className="size-7 rounded-lg bg-gradient-to-br from-primary to-cta" />
      Monthati
    </Link>
  );
}

/** Decorative ticket stub: the brand motif, and this layout's one signature animation. */
function TicketStub() {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 48, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: -4 }}
      transition={{ ...spring.snappy, delay: 0.1 }}
      className="ticket-notch w-full max-w-sm rounded-xl bg-card [--notch-y:118px]"
    >
      <div className="space-y-2 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cta">Admit one</p>
        <p className="font-display text-2xl font-bold">Spring Formal</p>
        <p className="text-sm text-muted-foreground">Fri 24 Oct · 19:00 · Great Hall</p>
      </div>
      <div className="perforation mx-6" />
      <div className="flex items-center justify-between p-6">
        <span className="tabular text-sm text-muted-foreground">MTH-7Q4K-29XD</span>
        <span className="tabular text-sm text-success">VALID</span>
      </div>
    </motion.div>
  );
}

/** Split screen for login, sign-up and invite pages. The brand panel is always dark. */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,1.1fr)]">
      <aside className="dark relative hidden flex-col justify-between overflow-hidden bg-background p-12 text-foreground lg:flex">
        <Logo />
        <div className="space-y-10">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.out }}
            className="max-w-md text-5xl leading-[1.05] font-extrabold"
          >
            Every campus night, <span className="text-primary">one tap</span> away.
          </motion.h2>
          <TicketStub />
        </div>
        <p className="text-sm text-muted-foreground">Sol Plaatje University events office</p>
      </aside>

      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8 lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <ThemeToggle />
        </header>
        <main
          id="main"
          className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center"
        >
          <div className="w-full max-w-md">
            <AnimatedOutlet />
          </div>
        </main>
      </div>
    </div>
  );
}
