import {
  CAPTION_MAX,
  COVER_MAX_BYTES,
  COVER_TYPES,
  formatDay,
  formatTime,
  type EventDetail,
  type Photo,
} from '@monthati/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Camera, Heart, Images, Lock, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth';
import { photosQuery, usePhotoMutations } from '@/lib/social';
import { cn } from '@/lib/utils';

/** Per-event photo wall: opens at the start time, holders post, everyone browses. */
export function PhotoWall({ event }: { event: EventDetail }) {
  const query = useInfiniteQuery(photosQuery(event.id));
  const [open, setOpen] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const photos = query.data?.pages.flatMap((p) => p.photos) ?? [];
  const first = query.data?.pages[0];
  const opensAt = first?.opensAt ?? event.startsAt;
  const locked = new Date(opensAt) > new Date();

  return (
    <section className="space-y-4" aria-labelledby="photos-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="photos-heading" className="flex items-center gap-2 text-xl font-bold">
          <Images className="size-5 text-primary" aria-hidden /> Photo wall
        </h2>
        {first?.canUpload && (
          <Button variant="outline" onClick={() => setUploading(true)}>
            <Camera aria-hidden /> Add a photo
          </Button>
        )}
      </div>

      {query.isPending ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-5 text-muted-foreground">
          {locked ? (
            <>
              <Lock className="size-5 shrink-0" aria-hidden />
              <p>
                Opens {formatDay(opensAt)} at {formatTime(opensAt)}. Ticket holders can share photos
                from the night.
              </p>
            </>
          ) : (
            <>
              <Images className="size-5 shrink-0" aria-hidden />
              <p>No photos yet{first?.canUpload ? '. Be the first to post one.' : '.'}</p>
            </>
          )}
        </div>
      ) : (
        <ul className="columns-2 gap-2 sm:columns-3 [&>li]:mb-2">
          {photos.map((p) => (
            <li key={p.id} className="break-inside-avoid">
              <button
                type="button"
                onClick={() => setOpen(p)}
                className="group relative block w-full cursor-pointer overflow-hidden rounded-lg"
                aria-label={
                  p.caption
                    ? `Photo by ${p.author.name}: ${p.caption}`
                    : `Photo by ${p.author.name}`
                }
              >
                <img
                  src={p.url}
                  alt=""
                  loading="lazy"
                  className="w-full transition-transform duration-300 group-hover:scale-[1.02]"
                />
                {p.likeCount > 0 && (
                  <span className="tabular absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">
                    <Heart className="size-3 fill-current" aria-hidden /> {p.likeCount}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          More photos
        </Button>
      )}

      {open && (
        <PhotoDialog
          eventId={event.id}
          // Keep the dialog in sync with optimistic like changes.
          photo={photos.find((p) => p.id === open.id) ?? open}
          onClose={() => setOpen(null)}
        />
      )}
      {uploading && <UploadDialog eventId={event.id} onClose={() => setUploading(false)} />}
    </section>
  );
}

function PhotoDialog({
  eventId,
  photo,
  onClose,
}: {
  eventId: string;
  photo: Photo;
  onClose: () => void;
}) {
  const { user } = useSession();
  const { like, remove } = usePhotoMutations(eventId);
  const [confirm, setConfirm] = useState(false);
  const canDelete = user && (user.id === photo.author.id || user.role === 'admin');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Photo by ${photo.author.name}`}
        description={photo.caption || undefined}
        className="max-w-2xl"
      >
        <img
          src={photo.url}
          alt={photo.caption || `Photo by ${photo.author.name}`}
          className="max-h-[60vh] w-full rounded-lg object-contain"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={!user}
            aria-pressed={photo.likedByMe}
            aria-label={photo.likedByMe ? 'Unlike photo' : 'Like photo'}
            onClick={() =>
              like.mutate(
                { id: photo.id, liked: !photo.likedByMe },
                { onError: (err) => toast.error(err.message) },
              )
            }
            className={cn(
              'tabular inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors disabled:cursor-default',
              photo.likedByMe && 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            <Heart className={cn('size-5', photo.likedByMe && 'fill-current')} aria-hidden />{' '}
            {photo.likeCount}
          </button>
          {canDelete && (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
              loading={remove.isPending}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                remove.mutate(photo.id, {
                  onSuccess: () => {
                    toast.success('Photo removed');
                    onClose();
                  },
                  onError: (err) => toast.error(err.message),
                });
              }}
            >
              <Trash2 aria-hidden /> {confirm ? 'Tap again to remove' : 'Remove'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { upload } = usePhotoMutations(eventId);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function choose(f: File | undefined) {
    if (!f) return;
    if (!(COVER_TYPES as readonly string[]).includes(f.type))
      return toast.error('Choose a JPG, PNG or WebP photo');
    if (f.size > COVER_MAX_BYTES) return toast.error('Photos must be 5 MB or smaller');
    setFile(f);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Add to the photo wall"
        description="Everyone can see the wall. Keep it friendly."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            upload.mutate(
              { file, caption: caption.trim() },
              {
                onSuccess: () => {
                  toast.success('Photo posted');
                  onClose();
                },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
        >
          <input
            ref={input}
            type="file"
            accept={COVER_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => choose(e.target.files?.[0])}
          />
          {preview ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="block w-full cursor-pointer"
              aria-label="Choose a different photo"
            >
              <img src={preview} alt="" className="max-h-72 w-full rounded-lg object-contain" />
            </button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-32 w-full flex-col"
              onClick={() => input.current?.click()}
            >
              <Camera className="size-7!" aria-hidden />
              Choose a photo
            </Button>
          )}
          <Field label="Caption (optional)">
            {(c) => (
              <Input
                {...c}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={CAPTION_MAX}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!file} loading={upload.isPending}>
              Post photo
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
