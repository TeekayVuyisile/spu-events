import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
} from '@spu-events/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api';
import { useReport } from '@/lib/community';
import { cn } from '@/lib/utils';

/** Report a comment or photo to the moderators. */
export function ReportDialog({
  targetType,
  targetId,
  onClose,
}: {
  targetType: ReportTarget;
  targetId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string>();
  const report = useReport();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Report this ${targetType}`}
        description="Moderators review every report. The author won’t see who reported them."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason) return setError('Choose a reason');
            report.mutate(
              { targetType, targetId, reason, details: details.trim() },
              {
                onSuccess: () => {
                  toast.success('Thanks. A moderator will take a look.');
                  onClose();
                },
                onError: (err) =>
                  setError(
                    err instanceof ApiRequestError
                      ? (err.error.fields?.details?.[0] ?? err.message)
                      : 'Couldn’t send the report. Try again.',
                  ),
              },
            );
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">What’s wrong?</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 transition-colors',
                  reason === r ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => {
                    setReason(r);
                    setError(undefined);
                  }}
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{REPORT_REASON_LABELS[r]}</span>
              </label>
            ))}
          </fieldset>
          <Field label={reason === 'other' ? 'Details' : 'Details (optional)'} error={error}>
            {(c) => (
              <Textarea
                {...c}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
                maxLength={500}
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
            <Button type="submit" variant="destructive" loading={report.isPending}>
              Send report
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
