import { formatCents, type Dashboard } from '@monthati/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { shortDate } from '@/lib/admin-format';

export type SalesMetric = 'tickets' | 'revenueCents';

const format = (metric: SalesMetric, n: number) =>
  metric === 'tickets' ? String(n) : formatCents(n);

/**
 * Daily sales as an area chart: primary stroke, 20% fill (admin-dashboard.md).
 * Colours come from the theme tokens, so it follows light and dark mode.
 * Hidden from screen readers: the "View as table" toggle is the accessible version.
 */
export function SalesChart({ daily, metric }: { daily: Dashboard['daily']; metric: SalesMetric }) {
  return (
    <div aria-hidden className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={daily}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <defs>
            <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            tickFormatter={(n: number) =>
              metric === 'tickets' ? String(n) : `R${Math.round(n / 100)}`
            }
            tickLine={false}
            axisLine={false}
            width={metric === 'tickets' ? 32 : 56}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-border)' }}
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(n) => [
              format(metric, Number(n)),
              metric === 'tickets' ? 'Tickets' : 'Revenue',
            ]}
            contentStyle={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-foreground)',
            }}
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#sales-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
