import { ScanLine } from 'lucide-react';
import { SignOutButton } from '@/components/account/sign-out-button';
import { useSession } from '@/lib/auth';

/** Staff landing page. Always dark (gate-scanner.md); the scanner itself arrives in phase 4. */
export function GatePage() {
  const { user } = useSession();

  return (
    <div className="dark flex min-h-dvh flex-col bg-background p-6 text-foreground">
      <header className="flex items-center justify-between">
        <span className="font-display text-lg font-extrabold">Monthati Gate</span>
        <span className="text-sm text-muted-foreground">{user?.firstName}</span>
      </header>

      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
      >
        <span className="flex size-24 items-center justify-center rounded-3xl bg-primary/15 text-primary">
          <ScanLine className="size-12" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold">You’re signed in as gate staff</h1>
          <p className="text-muted-foreground">
            The ticket scanner arrives in phase 4 of the redesign.
          </p>
        </div>
      </main>

      <SignOutButton size="lg" className="h-14 w-full" />
    </div>
  );
}
