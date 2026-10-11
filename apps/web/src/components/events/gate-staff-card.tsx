import { useQuery } from '@tanstack/react-query';
import { Loader2, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/input';
import { eventStaffQuery, staffQuery, useAssignStaff } from '@/lib/gate';

/** Choose which gate staff can scan this event. Admins can always scan. */
export function GateStaffCard({ eventId }: { eventId: string }) {
  const all = useQuery(staffQuery);
  const assigned = useQuery(eventStaffQuery(eventId));
  const save = useAssignStaff(eventId);
  // Unsaved edits; null means "showing what's saved".
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const saved = new Set(assigned.data?.map((s) => s.id));
  const selected = draft ?? saved;
  const dirty = selected.size !== saved.size || [...selected].some((id) => !saved.has(id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="size-5 text-primary" aria-hidden /> Gate staff
        </CardTitle>
        <CardDescription>Who can scan tickets at this event. Admins always can.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {all.isPending || assigned.isPending ? (
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-label="Loading staff"
          />
        ) : !all.data?.length ? (
          <p className="text-sm text-muted-foreground">
            No gate staff yet.{' '}
            <Link to="/admin/staff" className="font-semibold text-primary hover:underline">
              Invite some
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {all.data.map((s) => (
                <Checkbox
                  key={s.id}
                  label={`${s.firstName} ${s.lastName}`}
                  hint={s.email}
                  checked={selected.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setDraft(next);
                  }}
                />
              ))}
            </div>
            {dirty && (
              <Button
                className="w-full"
                loading={save.isPending}
                onClick={() =>
                  save.mutate([...selected], {
                    onSuccess: () => {
                      setDraft(null);
                      toast.success('Gate staff updated');
                    },
                    onError: (err) => toast.error(err.message),
                  })
                }
              >
                Save gate staff
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
