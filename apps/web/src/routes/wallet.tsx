import {
  formatCents,
  randsToCents,
  TOP_UP_MAX_CENTS,
  TOP_UP_MIN_CENTS,
  WITHDRAW_MIN_CENTS,
  type LedgerEntry,
  type LedgerKind,
} from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Plus,
  RotateCcw,
  Ticket,
  Wallet as WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { RollingNumber } from '@/components/motion/rolling-number';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useWalletMutation, walletQuery } from '@/lib/wallet';

const kindIcons: Record<LedgerKind, LucideIcon> = {
  top_up: ArrowDownLeft,
  withdrawal: Landmark,
  ticket_purchase: Ticket,
  ticket_refund: RotateCcw,
  adjustment: RotateCcw,
};

const when = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Johannesburg',
});

export function WalletPage() {
  const wallet = useQuery(walletQuery);
  const [dialog, setDialog] = useState<'top-up' | 'withdraw' | null>(null);

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-3xl font-extrabold md:text-4xl">Wallet</h1>

      {/* Balance as a ticket stub: amount on top, actions below the perforation. */}
      <Card className="ticket-notch overflow-hidden [--notch-y:132px]">
        <div className="space-y-1 p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <WalletIcon className="size-4" aria-hidden /> Balance
          </p>
          {wallet.isPending ? (
            <Skeleton className="h-12 w-48" />
          ) : (
            <p className="tabular text-5xl font-bold" aria-live="polite">
              <RollingNumber value={wallet.data?.balanceCents ?? 0} format={formatCents} />
            </p>
          )}
        </div>
        <div className="perforation mx-6 mt-4" />
        <div className="flex flex-wrap gap-3 p-6">
          <Button variant="cta" size="lg" onClick={() => setDialog('top-up')}>
            <Plus aria-hidden /> Top up
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setDialog('withdraw')}
            disabled={!wallet.data || wallet.data.balanceCents < WITHDRAW_MIN_CENTS}
          >
            <ArrowUpRight aria-hidden /> Withdraw
          </Button>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">History</h2>
        {wallet.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : wallet.isError ? (
          <FormAlert message={wallet.error.message} />
        ) : wallet.data.entries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            No activity yet. Top up to get your first ticket.
          </p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y">
              <AnimatePresence initial={false}>
                {wallet.data.entries.map((entry) => (
                  <LedgerRow key={entry.id} entry={entry} />
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        )}
      </section>

      <AmountDialog
        kind={dialog}
        balanceCents={wallet.data?.balanceCents ?? 0}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const Icon = kindIcons[entry.kind];
  const credit = entry.amountCents > 0;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out }}
      className="flex items-center gap-3 px-4 py-3.5"
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          credit ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.description}</p>
        <p className="tabular text-xs text-muted-foreground">
          {when.format(new Date(entry.createdAt))}
        </p>
      </div>
      <div className="text-right">
        {/* Sign and colour together, never colour alone. */}
        <p className={cn('tabular font-semibold', credit ? 'text-success' : 'text-foreground')}>
          {credit ? '+' : '−'}
          {formatCents(Math.abs(entry.amountCents))}
        </p>
        <p className="tabular text-xs text-muted-foreground">
          {formatCents(entry.balanceAfterCents)}
        </p>
      </div>
    </motion.li>
  );
}

const PRESETS = [5000, 10000, 20000, 50000];

function AmountDialog({
  kind,
  balanceCents,
  onClose,
}: {
  kind: 'top-up' | 'withdraw' | null;
  balanceCents: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      {kind && (
        <DialogContent
          title={kind === 'top-up' ? 'Top up your wallet' : 'Withdraw to your bank'}
          description={
            kind === 'top-up'
              ? 'Payments are simulated in this demo: no real card is charged.'
              : `You can withdraw up to ${formatCents(balanceCents)}.`
          }
        >
          {/* Keyed by kind so each opening gets a fresh form and a fresh requestId. */}
          <AmountForm key={kind} kind={kind} balanceCents={balanceCents} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function AmountForm({
  kind,
  balanceCents,
  onDone,
}: {
  kind: 'top-up' | 'withdraw';
  balanceCents: number;
  onDone: () => void;
}) {
  // One id per form: resubmitting after a timeout can't move money twice.
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const mutation = useWalletMutation(kind === 'top-up' ? 'top-ups' : 'withdrawals');

  const cents = /^\d+([.,]\d{1,2})?$/.test(amount.trim())
    ? randsToCents(Number(amount.trim().replace(',', '.')))
    : NaN;
  const max = kind === 'top-up' ? TOP_UP_MAX_CENTS : balanceCents;
  const min = kind === 'top-up' ? TOP_UP_MIN_CENTS : WITHDRAW_MIN_CENTS;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Number.isNaN(cents)) return setError('Enter an amount like 150 or 49.99');
    if (cents < min) return setError(`The minimum is ${formatCents(min)}`);
    if (cents > max) return setError(`The maximum is ${formatCents(max)}`);
    setError(undefined);
    mutation.mutate(
      { amountCents: cents, requestId },
      {
        onSuccess: () => {
          toast.success(
            kind === 'top-up'
              ? `${formatCents(cents)} added`
              : `${formatCents(cents)} on its way to your bank`,
          );
          onDone();
        },
        onError: (err) =>
          setError(
            err instanceof ApiRequestError ? err.message : 'Couldn’t reach Monthati. Try again.',
          ),
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {kind === 'top-up' && (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Quick amounts">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p / 100))}
              aria-pressed={cents === p}
              className={cn(
                'tabular h-11 cursor-pointer rounded-md border text-sm font-semibold transition-colors',
                cents === p
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'hover:border-primary/40',
              )}
            >
              R{p / 100}
            </button>
          ))}
        </div>
      )}
      <Field label="Amount (R)" error={error}>
        {(c) => (
          <Input
            {...c}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoFocus
            className="tabular"
            placeholder={
              kind === 'top-up' ? '100' : formatCents(balanceCents).replace(/[^\d.,]/g, '')
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
          variant={kind === 'top-up' ? 'cta' : 'default'}
          loading={mutation.isPending}
        >
          {kind === 'top-up' ? 'Top up' : 'Withdraw'}
          {!Number.isNaN(cents) && cents > 0 && (
            <span className="tabular">{formatCents(cents)}</span>
          )}
        </Button>
      </div>
    </form>
  );
}
