import {
  ADMIN_USER_PAGE_SIZE,
  adminUserListQuerySchema,
  type AdminUserListQuery,
  type Role,
  type UserStatus,
} from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { Ban, ChevronLeft, ChevronRight, Loader2, Search, UserRoundSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RoleBadge } from '@/components/admin/role-badge';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { adminUsersQuery } from '@/lib/admin';

const roles: { value: Role | undefined; label: string }[] = [
  { value: undefined, label: 'Everyone' },
  { value: 'student', label: 'Students' },
  { value: 'staff', label: 'Gate staff' },
  { value: 'admin', label: 'Admins' },
];

const statuses: { value: UserStatus | undefined; label: string }[] = [
  { value: undefined, label: 'Any status' },
  { value: 'suspended', label: 'Suspended' },
];

const joined = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Johannesburg',
});

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const filters = adminUserListQuerySchema.parse(Object.fromEntries(params));
  const [search, setSearch] = useState(filters.q ?? '');

  /** Any filter change goes back to page 1. */
  const update = (key: keyof AdminUserListQuery, value: string | number | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === undefined || value === '' || value === 1) next.delete(key);
        else next.set(key, String(value));
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: key !== 'page' },
    );

  useEffect(() => {
    const id = setTimeout(() => {
      if ((filters.q ?? '') !== search.trim()) update('q', search.trim() || undefined);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the input
  }, [search]);

  const users = useQuery(adminUsersQuery(filters));
  const first = (filters.page - 1) * ADMIN_USER_PAGE_SIZE + 1;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold md:text-4xl">Users</h1>
        <p className="text-muted-foreground">
          Find anyone by name, email or student number. Open a person to suspend, reinstate or
          adjust their wallet.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email or student number"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        <Segmented
          label="Role"
          options={roles}
          value={filters.role}
          onChange={(role) => update('role', role)}
          className="max-w-full overflow-x-auto"
        />
        <Segmented
          label="Status"
          options={statuses}
          value={filters.status}
          onChange={(status) => update('status', status)}
        />
      </div>

      <Card className="overflow-hidden">
        {users.isPending ? (
          <p className="flex items-center gap-2 p-5 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading users…
          </p>
        ) : users.isError ? (
          <div className="p-5">
            <FormAlert message={users.error.message} />
          </div>
        ) : users.data.users.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <UserRoundSearch
              className="size-10 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="font-display text-lg font-semibold">Nobody matches</p>
            <p className="text-muted-foreground">Try part of a name or an email address.</p>
          </div>
        ) : (
          <ul className="divide-y" aria-busy={users.isPlaceholderData}>
            {users.data.users.map((u) => (
              <li key={u.id}>
                <Link
                  to={`/admin/users/${u.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 md:px-5"
                >
                  <Avatar user={{ ...u, avatarUrl: null }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  </div>
                  <p className="tabular hidden w-28 text-sm text-muted-foreground md:block">
                    {u.studentNumber ?? '—'}
                  </p>
                  <p className="tabular hidden w-28 text-sm text-muted-foreground lg:block">
                    {joined.format(new Date(u.createdAt))}
                  </p>
                  <div className="flex w-28 shrink-0 flex-col items-end gap-1">
                    <RoleBadge role={u.role} />
                    {u.status === 'suspended' && (
                      <Badge tone="destructive">
                        <Ban aria-hidden /> Suspended
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {users.data && users.data.total > 0 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
          <p className="tabular text-sm text-muted-foreground" aria-live="polite">
            {first}–{first + users.data.users.length - 1} of {users.data.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={filters.page === 1}
              onClick={() => update('page', filters.page - 1)}
            >
              <ChevronLeft aria-hidden /> Previous
            </Button>
            <Button
              variant="outline"
              disabled={!users.data.nextPage}
              onClick={() => update('page', users.data.nextPage ?? undefined)}
            >
              Next <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
