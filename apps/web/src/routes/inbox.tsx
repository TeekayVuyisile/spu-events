import type { Notification, NotificationKind } from '@monthati/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarX,
  CheckCheck,
  Flag,
  HandHelping,
  Inbox as InboxIcon,
  RotateCcw,
  ShieldAlert,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { notificationsQuery, useMarkRead } from '@/lib/community';
import { cn } from '@/lib/utils';

const kindIcons: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  ticket_issued: { icon: Ticket, tone: 'bg-primary/12 text-primary' },
  ticket_refunded: { icon: RotateCcw, tone: 'bg-success/12 text-success' },
  event_changed: { icon: CalendarClock, tone: 'bg-warning/12 text-warning' },
  event_cancelled: { icon: CalendarX, tone: 'bg-destructive/12 text-destructive' },
  volunteer_accepted: { icon: HandHelping, tone: 'bg-success/12 text-success' },
  volunteer_declined: { icon: HandHelping, tone: 'bg-muted text-muted-foreground' },
  report_resolved: { icon: Flag, tone: 'bg-primary/12 text-primary' },
  content_removed: { icon: ShieldAlert, tone: 'bg-warning/12 text-warning' },
  account_warning: { icon: ShieldAlert, tone: 'bg-destructive/12 text-destructive' },
};

const when = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Johannesburg',
});

export function InboxPage() {
  const query = useInfiniteQuery(notificationsQuery);
  const markRead = useMarkRead();
  const items = query.data?.pages.flatMap((p) => p.notifications) ?? [];
  const unread = query.data?.pages[0]?.unreadCount ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold md:text-4xl">Inbox</h1>
        {unread > 0 && (
          <Button
            variant="outline"
            loading={markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            <CheckCheck aria-hidden /> Mark all read
          </Button>
        )}
      </div>

      {query.isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <FormAlert message={query.error.message} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
          <InboxIcon className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="font-display text-lg font-semibold">You’re all caught up</p>
          <p className="text-muted-foreground">Tickets, refunds and event updates show up here.</p>
        </div>
      ) : (
        <Stagger className="space-y-2">
          {items.map((n) => (
            <StaggerItem key={n.id}>
              <NotificationRow notification={n} onOpen={() => !n.read && markRead.mutate([n.id])} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          Older notifications
        </Button>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const { icon: Icon, tone } = kindIcons[n.kind];
  const content = (
    <>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tone)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className={cn('block', !n.read && 'font-semibold')}>{n.title}</span>
        {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
        <span className="tabular block text-xs text-muted-foreground">
          {when.format(new Date(n.createdAt))}
        </span>
      </span>
      {/* Unread is shown by weight and a labelled dot, not colour alone. */}
      {!n.read && (
        <span
          className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
          role="img"
        />
      )}
    </>
  );
  const className = cn(
    'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors',
    n.read ? 'bg-card' : 'border-primary/30 bg-primary/5',
    (n.link || !n.read) && 'cursor-pointer hover:border-primary/50',
  );

  return n.link ? (
    <Link to={n.link} onClick={onOpen} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={className}>
      {content}
    </button>
  );
}
