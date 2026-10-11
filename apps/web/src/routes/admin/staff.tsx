import { zodResolver } from '@hookform/resolvers/zod';
import {
  createInviteSchema,
  type CreatedInvite,
  type CreateInviteInput,
  type Invite,
  type InviteStatus,
} from '@monthati/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  CircleCheck,
  Clock,
  Copy,
  Hourglass,
  Link2,
  Loader2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { roleLabel } from '@/lib/auth';
import { applyServerError } from '@/lib/forms';
import { duration, ease } from '@/lib/motion';

const invitesKey = ['admin', 'invites'] as const;

const shortDate = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' });

const statusStyle: Record<
  InviteStatus,
  { label: string; icon: LucideIcon; tone: 'warning' | 'success' | 'neutral' }
> = {
  pending: { label: 'Pending', icon: Clock, tone: 'warning' },
  accepted: { label: 'Accepted', icon: CircleCheck, tone: 'success' },
  revoked: { label: 'Revoked', icon: Ban, tone: 'neutral' },
  expired: { label: 'Expired', icon: Hourglass, tone: 'neutral' },
};

export function StaffPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold md:text-4xl">Staff & invites</h1>
        <p className="max-w-2xl text-muted-foreground">
          Gate staff and admins can’t sign up publicly. Invite them here and share the link.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <InviteCard />
        <InviteList />
      </div>
    </div>
  );
}

function InviteCard() {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const form = useForm<CreateInviteInput>({
    resolver: zodResolver(createInviteSchema),
    defaultValues: { firstName: '', lastName: '', email: '', role: 'staff' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await api<CreatedInvite>('/admin/invites', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setCreated(result);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: invitesKey });
    } catch (err) {
      applyServerError(form, err);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-5 text-primary" aria-hidden /> Invite someone
        </CardTitle>
        <CardDescription>They choose their own password when they open the link.</CardDescription>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait" initial={false}>
          {created ? (
            <motion.div
              key="link"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.base, ease: ease.out }}
            >
              <InviteLink created={created} onDone={() => setCreated(null)} />
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={onSubmit}
              noValidate
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.fast }}
            >
              <FormAlert message={errors.root?.server?.message} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" error={errors.firstName?.message}>
                  {(control) => <Input {...control} {...form.register('firstName')} />}
                </Field>
                <Field label="Last name" error={errors.lastName?.message}>
                  {(control) => <Input {...control} {...form.register('lastName')} />}
                </Field>
              </div>
              <Field label="Email" error={errors.email?.message}>
                {(control) => (
                  <Input
                    {...control}
                    {...form.register('email')}
                    type="email"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                )}
              </Field>
              <Field
                label="Role"
                error={errors.role?.message}
                hint="Gate staff can only scan tickets. Admins can do everything."
              >
                {(control) => (
                  <Select {...control} {...form.register('role')}>
                    <option value="staff">Gate staff</option>
                    <option value="admin">Admin</option>
                  </Select>
                )}
              </Field>
              <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
                Create invite link
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

/** Shown once after creating an invite: the link is the only copy of the token. */
function InviteLink({ created, onDone }: { created: CreatedInvite; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const { invite, url } = created;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Invite link copied');
    } catch {
      toast.error('Couldn’t copy. Select the link and copy it manually.');
    }
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 font-semibold text-success">
        <CircleCheck className="size-5" aria-hidden /> Invite ready for {invite.firstName}
      </p>
      <p className="text-sm text-muted-foreground">
        Send this link to {invite.email}. It works once and expires on{' '}
        {shortDate.format(new Date(invite.expiresAt))}. You won’t be able to see it again.
      </p>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="invite-url">
          Invite link
        </label>
        <Input
          id="invite-url"
          value={url}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="tabular text-sm"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={copy}
          aria-label="Copy invite link"
          title="Copy invite link"
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
      <Button type="button" variant="ghost" onClick={onDone} className="w-full">
        Invite someone else
      </Button>
    </div>
  );
}

function InviteList() {
  const queryClient = useQueryClient();
  const invites = useQuery({
    queryKey: invitesKey,
    queryFn: () => api<{ invites: Invite[] }>('/admin/invites'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api<{ invite: Invite }>(`/admin/invites/${id}/revoke`, { method: 'POST' }),
    onSuccess: ({ invite }) => {
      toast.success(`Invite for ${invite.firstName} revoked`);
      return queryClient.invalidateQueries({ queryKey: invitesKey });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-5 text-primary" aria-hidden /> Invites
        </CardTitle>
      </CardHeader>

      {invites.isPending ? (
        <CardContent>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading invites…
          </p>
        </CardContent>
      ) : invites.isError ? (
        <CardContent>
          <FormAlert message={invites.error.message} />
        </CardContent>
      ) : invites.data.invites.length === 0 ? (
        <CardContent>
          <p className="text-muted-foreground">No invites yet. Your first one will show up here.</p>
        </CardContent>
      ) : (
        <ul className="divide-y border-t">
          {invites.data.invites.map((invite) => {
            const status = statusStyle[invite.status];
            return (
              <li key={invite.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-semibold">
                    {invite.firstName} {invite.lastName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{invite.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={invite.role === 'admin' ? 'primary' : 'neutral'}>
                    {roleLabel(invite.role)}
                  </Badge>
                  <Badge tone={status.tone}>
                    <status.icon aria-hidden /> {status.label}
                  </Badge>
                  <span className="tabular text-xs text-muted-foreground">
                    {invite.status === 'pending'
                      ? `until ${shortDate.format(new Date(invite.expiresAt))}`
                      : shortDate.format(new Date(invite.createdAt))}
                  </span>
                </div>
                {invite.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 text-destructive hover:bg-destructive/10"
                    loading={revoke.isPending && revoke.variables === invite.id}
                    onClick={() => revoke.mutate(invite.id)}
                    aria-label={`Revoke invite for ${invite.firstName} ${invite.lastName}`}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
