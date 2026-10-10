import type { Health } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, Loader2 } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

/** Phase 0 placeholder: proves the shell, tokens, motion and API wiring end to end. */
export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/health') });

  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Phase 0 · foundations
        </p>
        <h1 className="text-4xl font-extrabold md:text-6xl">
          Every campus night, <span className="text-primary">one tap</span> away.
        </h1>
        <p className="text-lg text-muted-foreground">
          The new Monthati is under construction. Events, tickets and wallet arrive in the next
          phases.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="cta" size="lg">
            Get ticket · <span className="tabular">R150.00</span>
          </Button>
          <Button variant="outline" size="lg">
            Browse events
          </Button>
        </div>
      </section>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StaggerItem>
          <Card>
            <CardHeader>
              <CardTitle>API status</CardTitle>
              <CardDescription>Live from GET /api/health</CardDescription>
            </CardHeader>
            <CardContent aria-live="polite">
              {health.isPending ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" aria-hidden /> Checking…
                </p>
              ) : health.isSuccess ? (
                <p className="flex items-center gap-2 font-medium text-success">
                  <CircleCheck className="size-5" aria-hidden /> API up · database {health.data.db}
                </p>
              ) : (
                <p className="flex items-center gap-2 font-medium text-destructive">
                  <CircleX className="size-5" aria-hidden /> {health.error.message}
                </p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="overflow-hidden ticket-notch [--notch-y:96px]">
            <div className="h-24 bg-gradient-to-br from-primary to-cta" />
            <div className="perforation" />
            <CardHeader>
              <CardTitle>Ticket-stub card</CardTitle>
              <CardDescription>Notch + perforation utilities are ready.</CardDescription>
            </CardHeader>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <CardDescription>Outfit · Work Sans · JetBrains Mono</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="tabular text-lg">MTH-7Q4K-29XD</p>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
