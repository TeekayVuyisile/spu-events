import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ExternalLink,
  Flag,
  LayoutDashboard,
  ScanLine,
  UserRound,
} from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { SignOutButton } from '@/components/account/sign-out-button';
import { AnimatedOutlet } from '@/components/motion/animated-outlet';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { useSession } from '@/lib/auth';
import { moderationCountQuery } from '@/lib/community';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/events', label: 'Events', icon: CalendarDays },
  { to: '/admin/users', label: 'Users', icon: UserRound },
  { to: '/admin/moderation', label: 'Moderation', icon: Flag },
  { to: '/admin/staff', label: 'Staff & invites', icon: ScanLine },
] as const;

/** Open moderation items, so a backlog is visible from anywhere in admin. */
function ModerationBadge() {
  const { data: count = 0 } = useQuery(moderationCountQuery);
  if (!count) return null;
  return (
    <span className="tabular ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-xs font-bold text-[#1a1000]">
      {count}
      <span className="sr-only"> to review</span>
    </span>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted',
    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
  );

/** Admin shell: left sidebar from 768px, a scrollable tab row above that (MASTER.md §7). */
export function AdminShell() {
  const { user } = useSession();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 z-20 flex flex-col border-b bg-card md:h-dvh md:border-r md:border-b-0">
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            to="/admin"
            className="flex items-center gap-2.5 font-display text-lg font-extrabold whitespace-nowrap"
          >
            <span
              aria-hidden
              className="size-7 shrink-0 rounded-lg bg-gradient-to-br from-primary to-cta"
            />
            SPU Events{' '}
            <span className="font-sans text-xs font-semibold text-muted-foreground">Admin</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {/* On mobile the profile (with sign out) is reached from here; the sidebar footer is desktop-only. */}
            {user && (
              <Link
                to="/me"
                aria-label="Your profile"
                className="flex size-11 items-center justify-center rounded-full md:hidden"
              >
                <Avatar user={user} />
              </Link>
            )}
          </div>
        </div>

        <nav
          aria-label="Admin"
          className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:flex-col md:pb-0"
        >
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/admin'} className={linkClass}>
              <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              {label}
              {to === '/admin/moderation' && <ModerationBadge />}
            </NavLink>
          ))}
          <Link to="/" className={linkClass({ isActive: false })}>
            <ExternalLink className="size-5" strokeWidth={1.75} aria-hidden />
            Student site
          </Link>
        </nav>

        {user && (
          <div className="mt-auto hidden space-y-3 border-t p-4 md:block">
            <Link to="/me" className="flex items-center gap-3 rounded-md hover:opacity-80">
              <Avatar user={user} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </Link>
            <SignOutButton size="sm" className="w-full" />
          </div>
        )}
      </aside>

      <main id="main" className="min-w-0 px-4 py-8 md:px-8 md:py-10">
        <AnimatedOutlet />
      </main>
    </div>
  );
}
