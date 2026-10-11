import { zodResolver } from '@hookform/resolvers/zod';
import {
  volunteerApplySchema,
  type EventDetail,
  type VolunteerApplyInput,
  type VolunteerStatus,
} from '@spu-events/shared';
import { useQuery } from '@tanstack/react-query';
import { Ban, CircleCheck, Clock, HandHelping, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input, Textarea } from '@/components/ui/input';
import { useSession } from '@/lib/auth';
import { myApplicationQuery, useVolunteer } from '@/lib/community';
import { hasEnded } from '@/lib/events';
import { applyServerError } from '@/lib/forms';

const statusLook: Record<
  VolunteerStatus,
  { label: string; icon: LucideIcon; tone: 'warning' | 'success' | 'neutral' }
> = {
  pending: { label: 'Application pending', icon: Clock, tone: 'warning' },
  accepted: { label: 'You’re volunteering', icon: CircleCheck, tone: 'success' },
  declined: { label: 'Not this time', icon: Ban, tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', icon: Ban, tone: 'neutral' },
};

/** Shown on events that want volunteers. Students apply; everyone else sees a note. */
export function VolunteerCard({ event }: { event: EventDetail }) {
  const { user } = useSession();
  const isStudent = user?.role === 'student';
  const application = useQuery({ ...myApplicationQuery(event.id), enabled: isStudent });
  const { withdraw } = useVolunteer(event.id);
  const [applying, setApplying] = useState(false);

  if (!event.volunteersWanted || event.status !== 'published' || hasEnded(event)) return null;

  const app = application.data;
  // Declined or withdrawn students may apply again.
  const canApply =
    isStudent &&
    !application.isPending &&
    (!app || app.status === 'declined' || app.status === 'withdrawn');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandHelping className="size-5 text-success" aria-hidden /> Volunteers wanted
        </CardTitle>
        <CardDescription>Help run the event and get to know the organisers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {app && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusLook[app.status].tone}>
              {(() => {
                const Icon = statusLook[app.status].icon;
                return <Icon aria-hidden />;
              })()}
              {statusLook[app.status].label}
            </Badge>
            <span className="text-sm text-muted-foreground">as {app.role}</span>
          </div>
        )}

        {app?.status === 'pending' && (
          <Button
            variant="ghost"
            className="text-muted-foreground"
            loading={withdraw.isPending}
            onClick={() =>
              withdraw.mutate(undefined, {
                onSuccess: () => toast.success('Application withdrawn'),
                onError: (err) => toast.error(err.message),
              })
            }
          >
            Withdraw application
          </Button>
        )}

        {!user && <p className="text-sm text-muted-foreground">Log in as a student to apply.</p>}
        {user && !isStudent && (
          <p className="text-sm text-muted-foreground">Students can apply here.</p>
        )}

        {canApply &&
          (applying ? (
            <ApplyForm eventId={event.id} onDone={() => setApplying(false)} />
          ) : (
            <Button variant="outline" onClick={() => setApplying(true)}>
              {app ? 'Apply again' : 'Apply to volunteer'}
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}

function ApplyForm({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const { apply } = useVolunteer(eventId);
  const form = useForm<VolunteerApplyInput>({
    resolver: zodResolver(volunteerApplySchema),
    defaultValues: { role: '', motivation: '' },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await apply.mutateAsync(values);
          toast.success('Application sent. You’ll hear back in your inbox.');
          onDone();
        } catch (err) {
          applyServerError(form, err);
        }
      })}
    >
      <FormAlert message={errors.root?.server?.message} />
      <Field
        label="How would you like to help?"
        error={errors.role?.message}
        hint="e.g. Usher, registration desk, photographer"
      >
        {(c) => <Input {...c} {...form.register('role')} />}
      </Field>
      <Field label="Why you?" error={errors.motivation?.message}>
        {(c) => <Textarea {...c} {...form.register('motivation')} rows={3} className="min-h-0" />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={form.formState.isSubmitting}>
          Send application
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
