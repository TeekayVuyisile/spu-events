import { formatEventWhen, type ScanLogEntry, type ScanResultKind } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Clock,
  Loader2,
  Pause,
  Play,
  ScanLine,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { RollingNumber } from '@/components/motion/rolling-number';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { gateOverviewQuery, useLiveGate } from '@/lib/gate';
import { duration, ease } from '@/lib/motion';

const resultLook: Record<
  ScanResultKind,
  { label: string; icon: LucideIcon; tone: 'success' | 'warning' | 'destructive' }
> = {
  admitted: { label: 'Admitted', icon: CircleCheck, tone: 'success' },
  already_used: { label: 'Already used', icon: TriangleAlert, tone: 'warning' },
  invalid: { label: 'Invalid', icon: CircleX, tone: 'destructive' },
  wrong_event: { label: 'Wrong event', icon: CircleX, tone: 'destructive' },
  cancelled: { label: 'Cancelled', icon: CircleX, tone: 'destructive' },
  not_open: { label: 'Gates closed', icon: Clock, tone: 'warning' },
};

const time = new Intl.DateTimeFormat('en-ZA', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Africa/Johannesburg',
});

/**
 * Standout feature 3: the attendance counter updates in real time over SSE.
 * "Pause" freezes the scan list (not the data) so it can be read during a rush.
 */
export function LiveCheckinsPage() {
  const { id = '' } = useParams();
  const overview = useQuery(gateOverviewQuery(id));
  const { connected } = useLiveGate(id);
  const [frozen, setFrozen] = useState<ScanLogEntry[] | null>(null);

  if (overview.isPending) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  if (overview.isError) return <FormAlert message={overview.error.message} />;

  const { event, stats, recent } = overview.data;
  const scans = frozen ?? recent;
  const pct = stats.ticketsSold ? Math.round((stats.checkedIn / stats.ticketsSold) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to={`/admin/events/${id}`}>
            <ArrowLeft aria-hidden /> {event.title}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold md:text-4xl">Live check-ins</h1>
          <Badge tone={connected ? 'destructive' : 'neutral'}>
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${connected ? 'animate-pulse bg-destructive' : 'bg-muted-foreground'}`}
            />
            {connected ? 'LIVE' : 'Reconnecting'}
          </Badge>
        </div>
        <p className="tabular text-muted-foreground">
          {formatEventWhen(event.startsAt, event.endsAt)} · {event.venue}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm font-medium text-muted-foreground">Checked in</p>
            <p className="font-display text-6xl font-bold" aria-live="polite">
              <RollingNumber value={stats.checkedIn} format={String} className="tabular" />
              <span className="text-2xl text-muted-foreground">
                {' '}
                / <span className="tabular">{stats.ticketsSold}</span>
              </span>
            </p>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full origin-left rounded-full bg-primary"
                initial={false}
                animate={{ scaleX: pct / 100 }}
                transition={{ duration: duration.slow, ease: ease.out }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-5">
            <p className="text-sm font-medium text-muted-foreground">Attendance rate</p>
            <p className="tabular font-display text-5xl font-bold">{pct}%</p>
            <p className="tabular text-sm text-muted-foreground">
              {stats.ticketsSold - stats.checkedIn} still to arrive
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" aria-hidden /> Recent scans
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            onClick={() => setFrozen(frozen ? null : recent)}
            aria-pressed={frozen !== null}
          >
            {frozen ? <Play aria-hidden /> : <Pause aria-hidden />}
            {frozen ? 'Resume' : 'Pause'}
          </Button>
        </CardHeader>
        {scans.length === 0 ? (
          <CardContent>
            <p className="text-muted-foreground">
              No scans yet. They appear here the moment they happen.
            </p>
          </CardContent>
        ) : (
          <ul className="divide-y border-t">
            <AnimatePresence initial={false}>
              {scans.map((s) => {
                const look = resultLook[s.result];
                return (
                  <motion.li
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: duration.base, ease: ease.out }}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                  >
                    <span className="tabular w-20 text-sm text-muted-foreground">
                      {time.format(new Date(s.createdAt))}
                    </span>
                    <Badge tone={look.tone}>
                      <look.icon aria-hidden /> {look.label}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.holderName ?? 'Unknown ticket'}
                      {s.ticketCode && (
                        <span className="tabular ml-2 text-sm font-normal text-muted-foreground">
                          {s.ticketCode}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {s.gate ? `${s.gate} · ` : ''}
                      {s.staffName}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </div>
  );
}
