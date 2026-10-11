import { zodResolver } from '@hookform/resolvers/zod';
import {
  campusInputToIso,
  cancelEventSchema,
  CATEGORY_LABELS,
  COVER_MAX_BYTES,
  COVER_TYPES,
  EVENT_CATEGORIES,
  eventInputSchema,
  isoToCampusInput,
  randsToCents,
  type AdminEvent,
  type CancelEventInput,
  type EventInput,
} from '@monthati/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Copy,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { EventCover } from '@/components/events/event-cover';
import { EventStatusBadge } from '@/components/events/event-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { api, ApiRequestError } from '@/lib/api';
import { adminEventQuery, eventKeys, hasEnded } from '@/lib/events';
import { applyServerError } from '@/lib/forms';
import { NotFoundPage } from '@/routes/not-found';

/** "150", "49.99" or "49,99" → cents; anything else becomes NaN so the schema reports it. */
function parseRands(value: string) {
  const v = value.trim();
  return /^\d+([.,]\d{1,2})?$/.test(v) ? randsToCents(Number(v.replace(',', '.'))) : NaN;
}

/**
 * The form holds strings (as inputs do), named like the API fields, then converts
 * and validates with the shared schema. Errors land on the same field names either way.
 */
const formSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    venue: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    capacity: z.string(),
    priceCents: z.string(),
    volunteersWanted: z.boolean(),
  })
  .transform((v, ctx): EventInput => {
    const result = eventInputSchema.safeParse({
      ...v,
      startsAt: v.startsAt ? campusInputToIso(v.startsAt) : '',
      endsAt: v.endsAt ? campusInputToIso(v.endsAt) : '',
      capacity: /^\d+$/.test(v.capacity.trim()) ? Number(v.capacity) : NaN,
      priceCents: parseRands(v.priceCents),
    });
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      ctx.issues.push({ code: 'custom', message: issue.message, path: issue.path, input: v });
    }
    return z.NEVER;
  });
type FormValues = z.input<typeof formSchema>;

const emptyForm: FormValues = {
  title: '',
  description: '',
  category: '',
  venue: '',
  startsAt: '',
  endsAt: '',
  capacity: '',
  priceCents: '0',
  volunteersWanted: false,
};

function toForm(e: AdminEvent): FormValues {
  return {
    title: e.title,
    description: e.description,
    category: e.category,
    venue: e.venue,
    startsAt: isoToCampusInput(e.startsAt),
    endsAt: isoToCampusInput(e.endsAt),
    capacity: String(e.capacity),
    priceCents:
      e.priceCents % 100 === 0 ? String(e.priceCents / 100) : (e.priceCents / 100).toFixed(2),
    volunteersWanted: e.volunteersWanted,
  };
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

function uploadCover(id: string, file: File) {
  const body = new FormData();
  body.append('cover', file);
  return api<{ event: AdminEvent }>(`/admin/events/${id}/cover`, { method: 'PUT', body });
}

/** Client-side check so a wrong file fails instantly; the API re-checks the bytes. */
function coverProblem(file: File) {
  if (!(COVER_TYPES as readonly string[]).includes(file.type))
    return 'Choose a JPG, PNG or WebP image';
  if (file.size > COVER_MAX_BYTES) return 'Images must be 5 MB or smaller';
  return null;
}

export function EventEditorPage() {
  const { id } = useParams();
  const query = useQuery({ ...adminEventQuery(id ?? ''), enabled: !!id });

  if (!id) return <Editor key="new" />;
  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Loading event…
      </p>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiRequestError && query.error.status === 404)
      return <NotFoundPage />;
    throw query.error;
  }
  return <Editor key={query.data.id} event={query.data} />;
}

function Editor({ event }: { event?: AdminEvent }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const readOnly = event?.status === 'cancelled';
  const sold = event?.ticketsSold ?? 0;

  const form = useForm<FormValues, unknown, EventInput>({
    resolver: zodResolver(formSchema),
    defaultValues: event ? toForm(event) : emptyForm,
    disabled: readOnly,
  });
  const { errors, isDirty, isSubmitting } = form.formState;

  /** Keeps every cached view of this event in step after a change. */
  function saved(updated: AdminEvent) {
    queryClient.setQueryData(eventKeys.adminDetail(updated.id), { event: updated });
    void queryClient.invalidateQueries({ queryKey: eventKeys.admin });
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (event) {
        const { event: updated } = await api<{ event: AdminEvent }>(
          `/admin/events/${event.id}`,
          json('PUT', values),
        );
        saved(updated);
        form.reset(toForm(updated));
        toast.success('Changes saved');
        return;
      }

      let { event: created } = await api<{ event: AdminEvent }>(
        '/admin/events',
        json('POST', values),
      );
      if (pendingCover) {
        try {
          ({ event: created } = await uploadCover(created.id, pendingCover));
        } catch (err) {
          toast.error(`Draft saved, but the cover didn’t upload: ${(err as Error).message}`);
        }
      }
      saved(created);
      toast.success('Draft saved');
      navigate(`/admin/events/${created.id}`, { replace: true });
    } catch (err) {
      applyServerError(form, err);
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/admin/events">
            <ArrowLeft aria-hidden /> Events
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-3xl font-extrabold break-words md:text-4xl">
            {event ? event.title : 'New event'}
          </h1>
          {event && <EventStatusBadge event={event} />}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <FormAlert message={errors.root?.server?.message} />
          {readOnly && (
            <FormAlert
              message={`This event is cancelled, so it can’t be edited. Reason given: “${event?.cancellationReason ?? 'none'}”`}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="Title" error={errors.title?.message}>
                {(c) => <Input {...c} {...form.register('title')} placeholder="Spring Formal" />}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Category" error={errors.category?.message}>
                  {(c) => (
                    <Select {...c} {...form.register('category')}>
                      <option value="" disabled>
                        Choose…
                      </option>
                      {EVENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Venue" error={errors.venue?.message}>
                  {(c) => <Input {...c} {...form.register('venue')} placeholder="Great Hall" />}
                </Field>
              </div>
              <Field
                label="Description"
                error={errors.description?.message}
                hint="Line breaks are kept. What should students know before they go?"
              >
                {(c) => <Textarea {...c} {...form.register('description')} rows={6} />}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>When</CardTitle>
              <CardDescription>
                Campus time (SAST), whatever time zone your device uses.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Starts" error={errors.startsAt?.message}>
                {(c) => (
                  <Input
                    {...c}
                    {...form.register('startsAt')}
                    type="datetime-local"
                    className="tabular"
                  />
                )}
              </Field>
              <Field label="Ends" error={errors.endsAt?.message}>
                {(c) => (
                  <Input
                    {...c}
                    {...form.register('endsAt')}
                    type="datetime-local"
                    className="tabular"
                  />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tickets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Price (R)"
                  error={errors.priceCents?.message}
                  hint={
                    sold > 0
                      ? 'Locked: tickets have been sold at this price.'
                      : '0 makes it a free event.'
                  }
                >
                  {(c) => (
                    <Input
                      {...c}
                      {...form.register('priceCents')}
                      inputMode="decimal"
                      readOnly={sold > 0}
                      className="tabular read-only:bg-muted"
                    />
                  )}
                </Field>
                <Field
                  label="Capacity"
                  error={errors.capacity?.message}
                  hint={
                    sold > 0
                      ? `At least ${sold}: that many tickets are sold.`
                      : 'How many tickets can be issued.'
                  }
                >
                  {(c) => (
                    <Input
                      {...c}
                      {...form.register('capacity')}
                      inputMode="numeric"
                      className="tabular"
                    />
                  )}
                </Field>
              </div>
              <Checkbox
                {...form.register('volunteersWanted')}
                label="Looking for volunteers"
                hint="Students will be able to apply to help out."
              />
            </CardContent>
          </Card>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" loading={isSubmitting} disabled={!!event && !isDirty}>
                {event ? 'Save changes' : 'Save draft'}
              </Button>
              {event && isDirty && (
                <Button type="button" variant="ghost" onClick={() => form.reset()}>
                  Discard changes
                </Button>
              )}
            </div>
          )}
        </form>

        <div className="space-y-6 lg:sticky lg:top-6">
          <CoverCard
            event={event}
            pending={pendingCover}
            onPending={setPendingCover}
            onSaved={saved}
            readOnly={readOnly}
          />
          {event && <StatusCard event={event} dirty={isDirty} onSaved={saved} />}
        </div>
      </div>
    </div>
  );
}

function CoverCard({
  event,
  pending,
  onPending,
  onSaved,
  readOnly,
}: {
  event?: AdminEvent;
  pending: File | null;
  onPending: (file: File | null) => void;
  onSaved: (e: AdminEvent) => void;
  readOnly: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const upload = useMutation({
    mutationFn: (file: File) => uploadCover(event!.id, file),
    onSuccess: ({ event: e }) => {
      onSaved(e);
      toast.success('Cover updated');
    },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: () =>
      api<{ event: AdminEvent }>(`/admin/events/${event!.id}/cover`, { method: 'DELETE' }),
    onSuccess: ({ event: e }) => onSaved(e),
    onError: (err) => toast.error(err.message),
  });

  function choose(file: File | undefined) {
    if (!file) return;
    const problem = coverProblem(file);
    if (problem) return toast.error(problem);
    // Existing events upload right away; new ones upload after the first save.
    if (event) upload.mutate(file);
    else onPending(file);
  }

  const shown = {
    id: event?.id ?? 'new',
    category: event?.category ?? 'other',
    coverUrl: previewUrl ?? event?.coverUrl ?? null,
  } as const;
  const hasCover = Boolean(shown.coverUrl);
  const busy = upload.isPending || remove.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cover image</CardTitle>
        <CardDescription>16:9 works best. JPG, PNG or WebP, up to 5 MB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <EventCover event={shown} shared={false} className="aspect-video rounded-lg" />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
              <Loader2 className="size-6 animate-spin text-primary" aria-label="Uploading" />
            </div>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={COVER_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus aria-hidden /> {hasCover ? 'Replace' : 'Choose image'}
            </Button>
            {hasCover && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11"
                disabled={busy}
                onClick={() => (event && !pending ? remove.mutate() : onPending(null))}
              >
                Remove
              </Button>
            )}
          </div>
        )}
        {!event && pending && (
          <p className="text-sm text-muted-foreground">Uploads when you save the draft.</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusCard({
  event,
  dirty,
  onSaved,
}: {
  event: AdminEvent;
  dirty: boolean;
  onSaved: (e: AdminEvent) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'cancel' | 'delete' | null>(null);

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api<{ event: AdminEvent }>(`/admin/events/${event.id}/${path}`, json('POST', body)),
    onError: (err) => toast.error(err.message),
  });

  const run = (path: string, message: string, body?: unknown) =>
    action.mutate(
      { path, body },
      {
        onSuccess: ({ event: e }) => {
          onSaved(e);
          setDialog(null);
          toast.success(message);
        },
      },
    );

  const duplicate = () =>
    action.mutate(
      { path: 'duplicate' },
      {
        onSuccess: ({ event: copy }) => {
          onSaved(copy);
          toast.success('Copied into a new draft');
          navigate(`/admin/events/${copy.id}`);
        },
      },
    );

  const remove = useMutation({
    mutationFn: () => api<void>(`/admin/events/${event.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: eventKeys.adminDetail(event.id) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.admin });
      toast.success('Draft deleted');
      navigate('/admin/events', { replace: true });
    },
    onError: (err) => toast.error(err.message),
  });

  const pending = (path: string) => action.isPending && action.variables?.path === path;
  const upcoming = !hasEnded(event);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
        <CardDescription>
          {event.status === 'draft'
            ? 'Only admins can see drafts.'
            : event.status === 'published'
              ? 'Students can see this event.'
              : 'Cancelled. Students see the reason on the event page.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {event.status !== 'draft' && (
          <div className="space-y-1.5 pb-1">
            <p className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tickets sold</span>
              <span className="tabular font-semibold">
                {event.ticketsSold} / {event.capacity}
              </span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (event.ticketsSold / event.capacity) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {event.status === 'draft' && (
          <>
            <Button
              variant="cta"
              className="w-full"
              disabled={dirty || !upcoming}
              loading={pending('publish')}
              onClick={() => run('publish', 'Published. Students can see it now.')}
            >
              {!pending('publish') && <Send aria-hidden />} Publish
            </Button>
            {dirty && (
              <p className="text-sm text-muted-foreground">Save your changes before publishing.</p>
            )}
            {!upcoming && (
              <p className="text-sm text-muted-foreground">
                Move the dates into the future to publish.
              </p>
            )}
          </>
        )}

        {event.status !== 'draft' && (
          <Button asChild variant="outline" className="w-full">
            <Link to={`/events/${event.slug}`} target="_blank" rel="noopener">
              View event page <ArrowUpRight aria-hidden />
            </Link>
          </Button>
        )}

        {event.status === 'published' && (
          <>
            <Button
              variant="outline"
              className="w-full"
              loading={pending('unpublish')}
              onClick={() => run('unpublish', 'Moved back to drafts')}
            >
              {!pending('unpublish') && <Undo2 aria-hidden />} Unpublish
            </Button>
            {upcoming && (
              <Button
                variant="ghost"
                className="w-full text-destructive hover:bg-destructive/10"
                onClick={() => setDialog('cancel')}
              >
                <Ban aria-hidden /> Cancel event
              </Button>
            )}
          </>
        )}

        <Button
          variant="ghost"
          className="w-full"
          loading={pending('duplicate')}
          onClick={duplicate}
        >
          {!pending('duplicate') && <Copy aria-hidden />} Duplicate
        </Button>

        {event.status === 'draft' && (
          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={() => setDialog('delete')}
          >
            <Trash2 aria-hidden /> Delete draft
          </Button>
        )}
      </CardContent>

      <CancelDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        busy={pending('cancel')}
        onConfirm={(values) => run('cancel', 'Event cancelled', values)}
      />

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => setDialog(open ? 'delete' : null)}>
        <DialogContent
          title="Delete this draft?"
          description={`“${event.title}” will be removed for good.`}
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (values: CancelEventInput) => void;
}) {
  const form = useForm<CancelEventInput>({
    resolver: zodResolver(cancelEventSchema),
    defaultValues: { reason: '' },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Cancel this event?"
        description="Every ticket holder is refunded to their wallet straight away, and students see your reason. This can’t be undone."
      >
        <form onSubmit={form.handleSubmit(onConfirm)} noValidate className="space-y-4">
          <Field label="Reason" error={form.formState.errors.reason?.message}>
            {(c) => (
              <Textarea
                {...c}
                {...form.register('reason')}
                rows={3}
                placeholder="The venue is unavailable…"
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Keep event
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" loading={busy}>
              Cancel event
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
