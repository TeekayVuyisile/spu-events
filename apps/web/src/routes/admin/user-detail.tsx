import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADJUSTMENT_MAX_CENTS,
  formatCents,
  formatDay,
  randsToCents,
  suspendUserSchema,
  type AdminUserDetail,
  type AuditAction,
  type SuspendUserInput,
} from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  History,
  Loader2,
  ShieldCheck,
  Ticket,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { RoleBadge } from '@/components/admin/role-badge';
import { TicketStatusBadge } from '@/components/tickets/ticket-status-badge';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { adminUserQuery, useUserAction } from '@/lib/admin';
import { formatDateTime } from '@/lib/admin-format';
import { ApiRequestError } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { applyServerError } from '@/lib/forms';
import { cn } from '@/lib/utils';

const historyLook: Record<AuditAction, { icon: LucideIcon; tone: string; label: string }> = {
  user_suspended: { icon: Ban, tone: 'bg-destructive/12 text-destructive', label: 'Suspended' },
  user_reinstated: { icon: ShieldCheck, tone: 'bg-success/12 text-success', label: 'Reinstated' },
  wallet_adjusted: { icon: Wallet, tone: 'bg-primary/12 text-primary', label: 'Wallet adjusted' },
};

export function UserDetailPage() {
  const { id = '' } = useParams();
  const user = useQuery(adminUserQuery(id));

  return (
    <div className="max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/admin/users">
          <ArrowLeft aria-hidden /> Users
        </Link>
      </Button>
      {user.isPending ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Loading…
        </p>
      ) : user.isError ? (
        <FormAlert message={user.error.message} />
      ) : (
        <UserDetail user={user.data} />
      )}
    </div>
  );
}

function UserDetail({ user }: { user: AdminUserDetail }) {
  const { user: me } = useSession();
  const [dialog, setDialog] = useState<'status' | 'wallet' | null>(null);
  const suspended = user.status === 'suspended';
  const isStudent = user.role === 'student';
  // Mirrors the API: admins (including you) can't be suspended from here.
  const canSuspend = user.role !== 'admin' && user.id !== me?.id;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar user={{ ...user, avatarUrl: null }} className="size-16 text-xl" />
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-3xl font-extrabold break-words md:text-4xl">
              {user.firstName} {user.lastName}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={user.role} />
              {suspended ? (
                <Badge tone="destructive">
                  <Ban aria-hidden /> Suspended
                </Badge>
              ) : (
                <Badge tone="success">
                  <CircleCheck aria-hidden /> Active
                </Badge>
              )}
            </div>
            <p className="tabular text-sm break-all text-muted-foreground">
              {user.email}
              {user.studentNumber && ` · ${user.studentNumber}`} · joined{' '}
              {formatDay(user.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isStudent && (
            <Button variant="outline" onClick={() => setDialog('wallet')}>
              <Wallet aria-hidden /> Adjust wallet
            </Button>
          )}
          {suspended ? (
            <Button onClick={() => setDialog('status')}>
              <ShieldCheck aria-hidden /> Reinstate
            </Button>
          ) : (
            canSuspend && (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setDialog('status')}
              >
                <Ban aria-hidden /> Suspend
              </Button>
            )
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {isStudent && <Stat label="Balance" value={formatCents(user.balanceCents ?? 0)} />}
        <Stat label="Active tickets" value={user.stats.activeTickets} />
        <Stat label="Events attended" value={user.stats.attended} />
        <Stat label="Comments" value={user.stats.comments} />
        <Stat
          label="Times reported"
          value={user.stats.reportsAgainst}
          warn={user.stats.reportsAgainst > 0}
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="size-5 text-primary" aria-hidden /> Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <ul className="divide-y">
                {user.tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={`/admin/events/${t.event.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {t.event.title}
                      </Link>
                      <p className="tabular text-xs text-muted-foreground">
                        {formatDay(t.event.startsAt)} · {t.code} ·{' '}
                        {t.pricePaidCents ? formatCents(t.pricePaidCents) : 'Free'}
                      </p>
                    </div>
                    <TicketStatusBadge ticket={{ status: t.status, cancelReason: null }} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {isStudent && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-5 text-primary" aria-hidden /> Wallet history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {user.ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
              ) : (
                <ul className="divide-y">
                  {user.ledger.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.description}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {formatDateTime(e.createdAt)}
                        </p>
                      </div>
                      <p
                        className={cn(
                          'tabular shrink-0 font-semibold',
                          e.amountCents > 0 && 'text-success',
                        )}
                      >
                        {e.amountCents > 0 ? '+' : '−'}
                        {formatCents(Math.abs(e.amountCents))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" aria-hidden /> Admin history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin actions on this account yet.</p>
          ) : (
            <ol className="space-y-4">
              {user.history.map((h) => {
                const look = historyLook[h.action];
                return (
                  <li key={h.id} className="flex gap-3">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        look.tone,
                      )}
                    >
                      <look.icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium">
                        {look.label}
                        {h.amountCents !== null && (
                          <span className="tabular">
                            {' '}
                            {h.amountCents > 0 ? '+' : '−'}
                            {formatCents(Math.abs(h.amountCents))}
                          </span>
                        )}
                      </p>
                      <p className="text-sm break-words">{h.reason}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {h.actorName ?? 'A former admin'} · {formatDateTime(h.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {dialog === 'status' && <StatusDialog user={user} onClose={() => setDialog(null)} />}
      {dialog === 'wallet' && <WalletDialog user={user} onClose={() => setDialog(null)} />}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <Card className="px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('font-display text-2xl font-bold tabular-nums', warn && 'text-warning')}>
        {value}
      </dd>
    </Card>
  );
}

function StatusDialog({ user, onClose }: { user: AdminUserDetail; onClose: () => void }) {
  const reinstating = user.status === 'suspended';
  const action = useUserAction(user.id);
  const form = useForm<SuspendUserInput>({
    resolver: zodResolver(suspendUserSchema),
    defaultValues: { reason: '' },
  });

  const onSubmit = form.handleSubmit((input) =>
    action.mutate(
      { kind: reinstating ? 'reinstate' : 'suspend', input },
      {
        onSuccess: () => {
          toast.success(
            reinstating ? `${user.firstName} can sign in again` : `${user.firstName} is suspended`,
          );
          onClose();
        },
        onError: (err) => applyServerError(form, err),
      },
    ),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={reinstating ? `Reinstate ${user.firstName}?` : `Suspend ${user.firstName}?`}
        description={
          reinstating
            ? 'They can sign in again straight away and get a notification with your reason.'
            : 'They’re signed out everywhere at once and can’t sign in until reinstated. Tickets stay as they are.'
        }
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormAlert message={form.formState.errors.root?.server?.message} />
          <Field
            label="Reason"
            error={form.formState.errors.reason?.message}
            hint="Kept in the admin history."
          >
            {(c) => (
              <Textarea
                {...c}
                {...form.register('reason')}
                rows={3}
                className="min-h-0"
                placeholder={
                  reinstating ? 'Met with them; first offence.' : 'Reselling tickets above price.'
                }
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={reinstating ? 'default' : 'destructive'}
              loading={action.isPending}
            >
              {reinstating ? 'Reinstate' : 'Suspend'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const amountPattern = /^\d+([.,]\d{1,2})?$/;

const adjustFormSchema = z.object({
  direction: z.enum(['credit', 'debit']),
  amount: z
    .string()
    .trim()
    .regex(amountPattern, 'Enter an amount like 150 or 49.99')
    .refine(
      (v) => {
        const cents = randsToCents(Number(v.replace(',', '.')));
        return cents >= 1 && cents <= ADJUSTMENT_MAX_CENTS;
      },
      `Between R0.01 and ${formatCents(ADJUSTMENT_MAX_CENTS)}`,
    ),
  reason: suspendUserSchema.shape.reason,
});
type AdjustForm = z.infer<typeof adjustFormSchema>;

function WalletDialog({ user, onClose }: { user: AdminUserDetail; onClose: () => void }) {
  // One id per dialog: a double-submit or retry can't adjust twice.
  const [requestId] = useState(() => crypto.randomUUID());
  const action = useUserAction(user.id);
  const form = useForm<AdjustForm>({
    resolver: zodResolver(adjustFormSchema),
    defaultValues: { direction: 'credit', amount: '', reason: '' },
  });
  const direction = useWatch({ control: form.control, name: 'direction' });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(({ direction, amount, reason }) => {
    const amountCents = randsToCents(Number(amount.replace(',', '.')));
    action.mutate(
      { kind: 'wallet-adjustments', input: { direction, amountCents, reason, requestId } },
      {
        onSuccess: () => {
          toast.success(
            direction === 'credit'
              ? `${formatCents(amountCents)} added`
              : `${formatCents(amountCents)} taken`,
          );
          onClose();
        },
        onError: (err) => {
          // The API names the field amountCents; the form calls it amount.
          const amountError =
            err instanceof ApiRequestError ? err.error.fields?.amountCents?.[0] : undefined;
          if (amountError) form.setError('amount', { message: err.message }, { shouldFocus: true });
          else applyServerError(form, err);
        },
      },
    );
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Adjust wallet"
        description={`Balance now: ${formatCents(user.balanceCents ?? 0)}. ${user.firstName} sees the reason in their wallet and inbox.`}
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormAlert message={errors.root?.server?.message} />
          <Segmented
            label="Direction"
            options={[
              { value: 'credit' as const, label: 'Credit' },
              { value: 'debit' as const, label: 'Debit' },
            ]}
            value={direction}
            onChange={(d) => form.setValue('direction', d)}
            className="w-fit"
          />
          <Field label="Amount (R)" error={errors.amount?.message}>
            {(c) => (
              <Input
                {...c}
                {...form.register('amount')}
                inputMode="decimal"
                autoFocus
                className="tabular"
                placeholder="50"
              />
            )}
          </Field>
          <Field label="Reason" error={errors.reason?.message} hint="Kept in the admin history.">
            {(c) => (
              <Textarea
                {...c}
                {...form.register('reason')}
                rows={2}
                className="min-h-0"
                placeholder="Refund for the cancelled bus trip"
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={action.isPending}>
              {direction === 'credit' ? 'Add money' : 'Take money'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
