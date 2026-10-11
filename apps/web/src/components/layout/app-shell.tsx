import { CalendarDays, Inbox, Ticket, UserRound, Wallet } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { AnimatedOutlet } from '@/components/motion/animated-outlet';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { unreadCountQuery } from '@/lib/community';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', label: 'Discover', icon: CalendarDays },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/me', label: 'Me', icon: UserRound },
] as const;

/** Unread notification count; hidden when signed out or nothing is unread. */
function UnreadBadge({ className }: { className?: string }) {
  const { user } = useSession();
  const { data: count = 0 } = useQuery({ ...unreadCountQuery, enabled: Boolean(user) });
  if (!user || count === 0) return null;
  return (
    <span
      className={cn(
        'tabular inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-cta px-1 text-[0.65rem] leading-none font-bold text-cta-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

/** Avatar link to the profile when signed in, a Log in button when not. */
function AccountButton() {
  const { user, isPending } = useSession();
  if (isPending) return <span className="size-11" />;
  if (!user) {
    return (
      <Button asChild size="sm" className="h-11">
        <Link to="/login">Log in</Link>
      </Button>
    );
  }
  return (
    <Link
      to="/me"
      aria-label="Your profile"
      title={`${user.firstName} ${user.lastName}`}
      className="flex size-11 items-center justify-center rounded-full"
    >
      <Avatar user={user} />
    </Link>
  );
}

/** Student shell: top nav on desktop, bottom tab bar under 768px (MASTER.md §7). */
export function AppShell() {
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold">
            <span aria-hidden className="size-7 rounded-lg bg-gradient-to-br from-primary to-cta" />
            SPU Events
          </NavLink>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  {label}
                  {to === '/inbox' && <UnreadBadge />}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountButton />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8 md:py-12">
        <AnimatedOutlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur-md md:hidden"
      >
        <ul className="grid grid-cols-5">
          {nav.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <span className="relative">
                  <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                  {to === '/inbox' && <UnreadBadge className="absolute -top-1.5 -right-2.5" />}
                </span>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
