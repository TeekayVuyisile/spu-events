import { REPORT_REASON_LABELS, type ModerationAction, type ModerationItem } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { Ban, Check, Flag, Loader2, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Textarea } from '@/components/ui/input';
import { moderationQuery, useModerate } from '@/lib/community';

const when = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Johannesburg',
});

const actionCopy: Record<
  Exclude<ModerationAction, 'dismiss'>,
  { title: string; button: string }
> = {
  remove: { title: 'Remove this post?', button: 'Remove' },
  remove_and_warn: { title: 'Remove and warn the author?', button: 'Remove and warn' },
  remove_and_suspend: {
    title: 'Remove and suspend the author?',
    button: 'Remove and suspend',
  },
};

export function ModerationPage() {
  const queue = useQuery(moderationQuery);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold md:text-4xl">Moderation</h1>
        <p className="text-muted-foreground">
          Reported comments and photos, oldest first. Every action notifies the author and the
          people who reported it.
        </p>
      </div>

      {queue.isPending ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Loading reports…
        </p>
      ) : queue.isError ? (
        <FormAlert message={queue.error.message} />
      ) : queue.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
          <ShieldCheck className="size-10 text-success" strokeWidth={1.5} aria-hidden />
          <p className="font-display text-lg font-semibold">Nothing to review</p>
          <p className="text-muted-foreground">New reports show up here.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {queue.data.map((item) => (
            <li key={`${item.targetType}:${item.targetId}`}>
              <QueueItem item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueItem({ item }: { item: ModerationItem }) {
  const moderate = useModerate();
  const [confirming, setConfirming] = useState<Exclude<ModerationAction, 'dismiss'> | null>(null);

  const run = (action: ModerationAction, note = '') =>
    moderate.mutate(
      { targetType: item.targetType, targetId: item.targetId, action, note },
      {
        onSuccess: () => {
          setConfirming(null);
          toast.success(action === 'dismiss' ? 'Reports dismissed' : 'Post removed');
        },
        onError: (err) => toast.error(err.message),
      },
    );

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="warning">
            <Flag aria-hidden /> {item.reports.length}{' '}
            {item.reports.length === 1 ? 'report' : 'reports'}
          </Badge>
          <span className="text-muted-foreground">
            {item.targetType === 'comment' ? 'Comment' : 'Photo'} on{' '}
            <Link
              to={`/events/${item.event.slug}`}
              className="font-medium text-foreground hover:underline"
            >
              {item.event.title}
            </Link>
          </span>
          {item.author && (
            <span className="text-muted-foreground">
              by {item.author.name} ({item.author.email})
              {item.author.status === 'suspended' && (
                <Badge tone="destructive" className="ml-2">
                  <Ban aria-hidden /> Suspended
                </Badge>
              )}
            </span>
          )}
        </div>

        <div className="rounded-lg bg-muted p-4">
          {item.photoUrl && (
            <img src={item.photoUrl} alt="Reported photo" className="mb-3 max-h-64 rounded-md" />
          )}
          {item.text ? (
            <p className="break-words whitespace-pre-line">{item.text}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {item.photoUrl ? 'No caption' : 'Already deleted by its author'}
            </p>
          )}
        </div>

        <ul className="space-y-1.5 text-sm">
          {item.reports.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{REPORT_REASON_LABELS[r.reason]}</span>
              {r.details && <span className="text-muted-foreground">“{r.details}”</span>}
              <span className="tabular text-muted-foreground">
                · {r.reporterName}, {when.format(new Date(r.createdAt))}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            variant="outline"
            loading={moderate.isPending && moderate.variables?.action === 'dismiss'}
            onClick={() => run('dismiss')}
          >
            <Check aria-hidden /> Keep it
          </Button>
          <Button variant="destructive" onClick={() => setConfirming('remove')}>
            <Trash2 aria-hidden /> Remove
          </Button>
          <Button
            variant="ghost"
            className="text-warning hover:bg-warning/10"
            onClick={() => setConfirming('remove_and_warn')}
          >
            <TriangleAlert aria-hidden /> Remove and warn
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setConfirming('remove_and_suspend')}
          >
            <Ban aria-hidden /> Remove and suspend
          </Button>
        </div>
      </CardContent>

      {confirming && (
        <ConfirmAction
          action={confirming}
          busy={moderate.isPending}
          onClose={() => setConfirming(null)}
          onConfirm={(note) => run(confirming, note)}
        />
      )}
    </Card>
  );
}

function ConfirmAction({
  action,
  busy,
  onClose,
  onConfirm,
}: {
  action: Exclude<ModerationAction, 'dismiss'>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const copy = actionCopy[action];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={copy.title}
        description={
          action === 'remove_and_suspend'
            ? 'The author is signed out immediately and can’t log in until reinstated.'
            : 'The author is told their post was removed.'
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(note.trim());
          }}
        >
          <Field label="Note to the author (optional)">
            {(c) => (
              <Textarea
                {...c}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={2}
                className="min-h-0"
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" loading={busy}>
              {copy.button}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
