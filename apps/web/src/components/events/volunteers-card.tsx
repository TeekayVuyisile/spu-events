import type { VolunteerApplicant, VolunteerStatus } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { HandHelping, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { applicantsQuery, useDecideVolunteers } from '@/lib/community';

const tone: Record<VolunteerStatus, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'neutral',
  withdrawn: 'neutral',
};

/** Volunteer applications for one event, with accept/decline for each or all pending. */
export function VolunteersCard({ eventId }: { eventId: string }) {
  const applicants = useQuery(applicantsQuery(eventId));
  const { one, all } = useDecideVolunteers(eventId);
  const [open, setOpen] = useState<string | null>(null);
  const list = (applicants.data ?? []).filter((a) => a.status !== 'withdrawn');
  const pending = list.filter((a) => a.status === 'pending').length;

  const decide = (a: VolunteerApplicant, decision: 'accept' | 'decline') =>
    one.mutate(
      { id: a.id, decision },
      {
        onSuccess: () =>
          toast.success(`${a.student.name} ${decision === 'accept' ? 'accepted' : 'declined'}`),
        onError: (err) => toast.error(err.message),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandHelping className="size-5 text-success" aria-hidden /> Volunteers
        </CardTitle>
        <CardDescription>
          {pending
            ? `${pending} waiting for a decision.`
            : 'Students are told the outcome in their inbox.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {applicants.isPending ? (
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-label="Loading volunteers"
          />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className="rounded-lg border p-3">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-start justify-between gap-2 text-left"
                  aria-expanded={open === a.id}
                  onClick={() => setOpen(open === a.id ? null : a.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.student.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.role}</span>
                  </span>
                  <Badge tone={tone[a.status]} className="capitalize">
                    {a.status}
                  </Badge>
                </button>
                {open === a.id && (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="whitespace-pre-line">{a.motivation}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {a.student.email}
                      {a.student.studentNumber && ` · ${a.student.studentNumber}`}
                    </p>
                  </div>
                )}
                {a.status === 'pending' && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="h-11 flex-1"
                      onClick={() => decide(a, 'accept')}
                      disabled={one.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={() => decide(a, 'decline')}
                      disabled={one.isPending}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {pending > 1 && (
          <div className="flex gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-11 flex-1"
              loading={all.isPending && all.variables === 'accept'}
              onClick={() =>
                all.mutate('accept', {
                  onSuccess: ({ decided }) => toast.success(`${decided} accepted`),
                })
              }
            >
              Accept all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 flex-1"
              loading={all.isPending && all.variables === 'decline'}
              onClick={() =>
                all.mutate('decline', {
                  onSuccess: ({ decided }) => toast.success(`${decided} declined`),
                })
              }
            >
              Decline all
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
