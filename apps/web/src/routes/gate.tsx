import { formatEventWhen } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, DoorOpen, Loader2, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { SignOutButton } from '@/components/account/sign-out-button';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { useSession } from '@/lib/auth';
import { isLive } from '@/lib/events';
import { gateEventsQuery, readGateName, saveGateName } from '@/lib/gate';

/** Staff home: pick an event to scan. Always dark (gate-scanner.md). */
export function GatePage() {
  const { user } = useSession();
  const events = useQuery(gateEventsQuery);
  const [gateName, setGateName] = useState(readGateName);

  return (
    <div className="dark flex min-h-dvh flex-col gap-6 bg-background p-4 text-foreground sm:p-6">
      <header className="flex items-center justify-between">
        <span className="font-display text-lg font-extrabold">Monthati Gate</span>
        <span className="text-sm text-muted-foreground">{user?.firstName}</span>
      </header>

      <main id="main" className="mx-auto w-full max-w-lg flex-1 space-y-6">
        <h1 className="text-3xl font-extrabold">Your events</h1>

        <label className="block space-y-1.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <DoorOpen className="size-4" aria-hidden /> Gate name on this phone (optional)
          </span>
          <Input
            value={gateName}
            onChange={(e) => setGateName(e.target.value)}
            onBlur={() => saveGateName(gateName)}
            placeholder="e.g. Gate B"
            maxLength={40}
            className="h-14"
          />
        </label>

        {events.isPending ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading your events…
          </p>
        ) : events.isError ? (
          <FormAlert message={events.error.message} />
        ) : events.data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
            <ScanLine className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-semibold">No events to scan right now</p>
            <p className="text-sm text-muted-foreground">
              An admin assigns you to events. They show up here from a week before.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.data.map((event) => (
              <li key={event.id}>
                <Link
                  to={`/gate/${event.id}`}
                  onClick={() => saveGateName(gateName)}
                  className="flex min-h-20 items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex items-center gap-2 truncate text-lg font-semibold">
                      {isLive(event) && (
                        <span
                          className="size-2 shrink-0 animate-pulse rounded-full bg-success"
                          aria-label="Live now"
                        />
                      )}
                      {event.title}
                    </p>
                    <p className="tabular truncate text-sm text-muted-foreground">
                      {formatEventWhen(event.startsAt, event.endsAt)} · {event.venue}
                    </p>
                    <p className="tabular text-sm">
                      {event.checkedIn} / {event.ticketsSold} checked in
                    </p>
                  </div>
                  <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <SignOutButton size="lg" className="mx-auto h-14 w-full max-w-lg" />
    </div>
  );
}
