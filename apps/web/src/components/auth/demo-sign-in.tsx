import type { Role } from '@spu-events/shared';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, LayoutDashboard, ScanLine, Sparkles, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { demoQuery, homeFor, useDemoLogin, useSession } from '@/lib/auth';

const CHOICES: { role: Role; label: string; hint: string; icon: LucideIcon }[] = [
  { role: 'student', label: 'Student', hint: 'Buy a ticket, show the QR', icon: GraduationCap },
  { role: 'staff', label: 'Gate staff', hint: 'Scan tickets at the gate', icon: ScanLine },
  { role: 'admin', label: 'Admin', hint: 'Dashboard and events', icon: LayoutDashboard },
];

/** Points signed-out visitors of a public demo at the one-click sign-in. */
export function DemoBanner() {
  const { user, isPending } = useSession();
  const { data } = useQuery({ ...demoQuery, enabled: !isPending && !user });
  if (user || !data?.enabled) return null;
  return (
    <div className="bg-primary text-primary-foreground">
      <p className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm">
        <span>
          <Sparkles className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
          This is a live demo. Try it as a student, gate staff or admin, no sign-up needed.
        </span>
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Try the demo
        </Link>
      </p>
    </div>
  );
}

/** One-click sign-in to the sample accounts. Only shows on a public demo deployment. */
export function DemoSignIn({ next }: { next: string | null }) {
  const navigate = useNavigate();
  const { data } = useQuery(demoQuery);
  const login = useDemoLogin();
  if (!data?.enabled) return null;

  const tryAs = async (role: Role) => {
    try {
      const { user } = await login.mutateAsync(role);
      // A `next` page meant for another role sends them to their own home anyway.
      navigate(next ?? homeFor(user!.role), { replace: true });
    } catch {
      // The error shows in the alert below.
    }
  };

  return (
    <section
      aria-labelledby="demo-heading"
      className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4"
    >
      <div className="space-y-1">
        <h2 id="demo-heading" className="font-semibold">
          Exploring the demo?
        </h2>
        <p className="text-sm text-muted-foreground">
          Sign in to a sample account with one click, no password needed.
          {data.resetHours && ` The data resets every ${data.resetHours} hours.`}
        </p>
      </div>
      <FormAlert message={login.error?.message} />
      <div className="grid gap-2 sm:grid-cols-3">
        {CHOICES.map(({ role, label, hint, icon: Icon }) => (
          <Button
            key={role}
            type="button"
            variant="outline"
            className="h-auto flex-col gap-1 bg-card py-3 whitespace-normal"
            loading={login.isPending && login.variables === role}
            disabled={login.isPending}
            onClick={() => void tryAs(role)}
            aria-label={`Try as ${label}`}
          >
            <Icon className="size-5 text-primary" aria-hidden />
            <span className="font-semibold">{label}</span>
            <span className="text-xs font-normal text-muted-foreground">{hint}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
