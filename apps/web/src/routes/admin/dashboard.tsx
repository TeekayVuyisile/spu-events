import {
  CATEGORY_LABELS,
  DASHBOARD_RANGES,
  dashboardQuerySchema,
  formatCents,
  formatDay,
  type Dashboard,
  type DashboardRange,
} from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Flag,
  HandHelping,
  ScanLine,
  Table2,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { SalesChart, type SalesMetric } from '@/components/admin/sales-chart';
import { categoryIcons } from '@/components/events/category-icons';
import { RollingNumber } from '@/components/motion/rolling-number';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardQuery } from '@/lib/admin';
import { delta, shortDate } from '@/lib/admin-format';
import { cn } from '@/lib/utils';

const rangeLabels: Record<DashboardRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

const percent = (n: number) => `${Math.round(n * 100)}%`;

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const { range } = dashboardQuerySchema.parse(Object.fromEntries(params));
  const dashboard = useQuery(dashboardQuery(range));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold md:text-4xl">Overview</h1>
          <p className="text-muted-foreground">
            Compared with the {rangeLabels[range]} before. Times are campus time.
          </p>
        </div>
        <Segmented
          label="Period"
          options={DASHBOARD_RANGES.map((r) => ({ value: r, label: rangeLabels[r] }))}
          value={range}
          onChange={(r) => setParams({ range: r }, { replace: true })}
        />
      </div>

      {dashboard.isPending ? (
        <DashboardSkeleton />
      ) : dashboard.isError ? (
        <FormAlert message={dashboard.error.message} />
      ) : (
        <DashboardBody data={dashboard.data} refreshing={dashboard.isPlaceholderData} />
      )}
    </div>
  );
}

function DashboardBody({ data, refreshing }: { data: Dashboard; refreshing: boolean }) {
  const { kpis } = data;
  return (
    // Tiles stagger in once; refetches only roll the numbers.
    <Stagger className={cn('space-y-6 transition-opacity', refreshing && 'opacity-60')}>
      <Attention attention={data.attention} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <KpiTile
          label="Revenue"
          hint="Ticket sales minus refunds"
          icon={Wallet}
          kpi={kpis.revenueCents}
          format={formatCents}
          kind="count"
        />
        <KpiTile
          label="Tickets sold"
          hint="Still active"
          icon={Ticket}
          kpi={kpis.ticketsSold}
          format={String}
          kind="count"
        />
        <KpiTile
          label="Check-in rate"
          hint="Events that ended in this period"
          icon={ScanLine}
          kpi={kpis.checkInRate}
          format={percent}
          kind="rate"
        />
        <KpiTile
          label="Active students"
          hint="Bought, liked, commented or posted"
          icon={Users}
          kpi={kpis.activeStudents}
          format={String}
          kind="count"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-2">
          <SalesCard daily={data.daily} />
        </StaggerItem>
        <StaggerItem>
          <CategoryCard byCategory={data.byCategory} />
        </StaggerItem>
      </div>

      <StaggerItem>
        <TopEventsCard events={data.topEvents} />
      </StaggerItem>
    </Stagger>
  );
}

function Attention({ attention }: { attention: Dashboard['attention'] }) {
  const items = [
    {
      n: attention.openReports,
      label: (n: number) => `${n} reported ${n === 1 ? 'post' : 'posts'} to review`,
      to: '/admin/moderation',
      icon: Flag,
    },
    {
      n: attention.pendingVolunteers,
      label: (n: number) => `${n} volunteer ${n === 1 ? 'application' : 'applications'} waiting`,
      to: '/admin/events?status=published',
      icon: HandHelping,
    },
    {
      n: attention.draftEvents,
      label: (n: number) => `${n} unpublished ${n === 1 ? 'draft' : 'drafts'}`,
      to: '/admin/events?status=draft',
      icon: CalendarClock,
    },
  ].filter((i) => i.n > 0);
  if (!items.length) return null;

  return (
    <StaggerItem>
      <ul aria-label="Needs attention" className="flex flex-wrap gap-2">
        {items.map(({ n, label, to, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-4 text-sm font-medium transition-colors hover:bg-warning/20"
            >
              <Icon className="size-4 text-warning" aria-hidden /> {label(n)}
            </Link>
          </li>
        ))}
      </ul>
    </StaggerItem>
  );
}

function KpiTile({
  label,
  hint,
  icon: Icon,
  kpi,
  format,
  kind,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  kpi: Dashboard['kpis']['revenueCents'];
  format: (n: number) => string;
  kind: 'count' | 'rate';
}) {
  const change = delta(kpi.value, kpi.previous, kind);
  return (
    <StaggerItem>
      <Card className="h-full">
        <CardContent className="space-y-2 pt-5">
          <p className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
            {label} <Icon className="size-4" aria-hidden />
          </p>
          <p className="font-display text-3xl font-bold md:text-[2.5rem] md:leading-tight">
            {kpi.value === null ? (
              <span className="text-muted-foreground">
                <span aria-hidden>–</span>
                <span className="sr-only">No data</span>
              </span>
            ) : (
              <RollingNumber
                value={kind === 'rate' ? Math.round(kpi.value * 100) : kpi.value}
                format={kind === 'rate' ? (n) => `${n}%` : format}
                className="tabular-nums"
              />
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {change && (
              <span
                className={cn(
                  'tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono font-semibold',
                  change.up ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                )}
              >
                {change.up ? (
                  <ArrowUpRight className="size-3.5" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden />
                )}
                <span className="sr-only">{change.up ? 'Up' : 'Down'} </span>
                {change.label}
              </span>
            )}
            <span>{hint}</span>
          </div>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}

function SalesCard({ daily }: { daily: Dashboard['daily'] }) {
  const [metric, setMetric] = useState<SalesMetric>('tickets');
  const [asTable, setAsTable] = useState(false);
  const total = daily.reduce((sum, d) => sum + d[metric], 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Sales per day</CardTitle>
          <CardDescription className="tabular">
            {metric === 'tickets' ? `${total} tickets` : `${formatCents(total)} net`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Segmented
            label="Measure"
            options={[
              { value: 'tickets' as const, label: 'Tickets' },
              { value: 'revenueCents' as const, label: 'Revenue' },
            ]}
            value={metric}
            onChange={setMetric}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={asTable}
            aria-label={asTable ? 'View as chart' : 'View as table'}
            title={asTable ? 'View as chart' : 'View as table'}
            onClick={() => setAsTable(!asTable)}
          >
            {asTable ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {asTable ? (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Sales per day</caption>
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-medium">
                    Day
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Tickets
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="tabular divide-y">
                {[...daily].reverse().map((d) => (
                  <tr key={d.date} className="h-11">
                    <th scope="row" className="text-left font-normal">
                      {shortDate(d.date)}
                    </th>
                    <td className="text-right">{d.tickets}</td>
                    <td className="text-right">{formatCents(d.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <SalesChart daily={daily} metric={metric} />
        )}
      </CardContent>
    </Card>
  );
}

function CategoryCard({ byCategory }: { byCategory: Dashboard['byCategory'] }) {
  const max = Math.max(1, ...byCategory.map((c) => c.tickets));
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Tickets by category</CardTitle>
      </CardHeader>
      <CardContent>
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tickets in this period.</p>
        ) : (
          <ul className="space-y-3">
            {byCategory.map(({ category, tickets }) => {
              const Icon = categoryIcons[category];
              return (
                <li key={category} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="size-4 text-muted-foreground" aria-hidden />
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="tabular text-muted-foreground">{tickets}</span>
                  </div>
                  <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full origin-left rounded-full bg-primary"
                      style={{ transform: `scaleX(${tickets / max})` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TopEventsCard({ events }: { events: Dashboard['topEvents'] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Top events</CardTitle>
        <CardDescription>Best sellers that start in this period or later.</CardDescription>
      </CardHeader>
      {events.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">No ticket sales yet.</p>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-y bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">
                  Event
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Sold
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Checked in
                </th>
                <th scope="col" className="px-5 py-2 text-right font-medium">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-muted/40">
                  <th scope="row" className="px-5 py-2.5 text-left font-normal">
                    <Link to={`/admin/events/${e.id}`} className="font-semibold hover:underline">
                      {e.title}
                    </Link>
                    <span className="tabular block text-xs text-muted-foreground">
                      {formatDay(e.startsAt)}
                    </span>
                  </th>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full origin-left rounded-full bg-primary"
                          style={{
                            transform: `scaleX(${Math.min(1, e.ticketsSold / e.capacity)})`,
                          }}
                        />
                      </div>
                      <span className="tabular">
                        {e.ticketsSold}/{e.capacity}
                      </span>
                    </div>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{e.checkedIn}</td>
                  <td className="tabular px-5 py-2.5 text-right">{formatCents(e.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status">
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <p className="sr-only">Loading the overview…</p>
    </div>
  );
}
