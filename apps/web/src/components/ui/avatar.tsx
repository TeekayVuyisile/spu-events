import type { SessionUser } from '@spu-events/shared';
import { initials } from '@/lib/auth';
import { cn } from '@/lib/utils';

/** Photo if the user has one, otherwise their initials on the brand colour. */
export function Avatar({
  user,
  className,
}: {
  user: Pick<SessionUser, 'firstName' | 'lastName' | 'avatarUrl'>;
  className?: string;
}) {
  const base = cn(
    'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 font-display text-sm font-bold text-primary',
    className,
  );
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className={cn(base, 'object-cover')} />
  ) : (
    <span aria-hidden className={base}>
      {initials(user)}
    </span>
  );
}
