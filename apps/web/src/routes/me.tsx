import { IdCard, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { SignOutButton } from '@/components/account/sign-out-button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { homeFor, roleLabel, useSession } from '@/lib/auth';

export function MePage() {
  const { user } = useSession();
  // The route loader guarantees a user; this only satisfies the type checker.
  if (!user) return null;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-3xl font-extrabold md:text-4xl">Your profile</h1>

      <Card>
        <CardContent className="flex items-center gap-4 pt-5">
          <Avatar user={user} className="size-16 text-xl" />
          <div className="min-w-0 space-y-1.5">
            <p className="truncate font-display text-xl font-bold">
              {user.firstName} {user.lastName}
            </p>
            <Badge tone={user.role === 'student' ? 'neutral' : 'primary'}>
              {user.role !== 'student' && <ShieldCheck aria-hidden />}
              {roleLabel(user.role)}
            </Badge>
          </div>
        </CardContent>

        <dl className="divide-y border-t">
          <div className="flex items-center gap-3 px-5 py-4">
            <Mail className="size-5 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Email</dt>
            <dd className="min-w-0 truncate">{user.email}</dd>
          </div>
          {user.studentNumber && (
            <div className="flex items-center gap-3 px-5 py-4">
              <IdCard className="size-5 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Student number</dt>
              <dd className="tabular">{user.studentNumber}</dd>
            </div>
          )}
        </dl>
      </Card>

      <div className="flex flex-wrap gap-3">
        {user.role !== 'student' && (
          <Button asChild>
            <Link to={homeFor(user.role)}>
              {user.role === 'admin' ? 'Open admin' : 'Open gate scanner'}
            </Link>
          </Button>
        )}
        <SignOutButton />
      </div>
    </div>
  );
}
