import type {
  AdminUserDetail,
  AdminUserListQuery,
  AdminUserPage,
  AttendeeList,
  Dashboard,
  DashboardRange,
  ReinstateUserInput,
  SuspendUserInput,
  WalletAdjustmentInput,
} from '@spu-events/shared';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

// ── Dashboard ──

export const dashboardQuery = (range: DashboardRange) =>
  queryOptions({
    queryKey: ['admin', 'dashboard', range],
    queryFn: () => api<{ dashboard: Dashboard }>(`/admin/dashboard?range=${range}`),
    select: (d) => d.dashboard,
    placeholderData: keepPreviousData,
  });

// ── Users ──

export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  list: (q: AdminUserListQuery) => ['admin', 'users', 'list', q] as const,
  detail: (id: string) => ['admin', 'users', 'detail', id] as const,
};

export const adminUsersQuery = (query: AdminUserListQuery) =>
  queryOptions({
    queryKey: adminUserKeys.list(query),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
      return api<AdminUserPage>(`/admin/users?${params}`);
    },
    placeholderData: keepPreviousData,
  });

export const adminUserQuery = (id: string) =>
  queryOptions({
    queryKey: adminUserKeys.detail(id),
    queryFn: () => api<{ user: AdminUserDetail }>(`/admin/users/${id}`),
    select: (d) => d.user,
  });

type UserAction =
  | { kind: 'suspend'; input: SuspendUserInput }
  | { kind: 'reinstate'; input: ReinstateUserInput }
  | { kind: 'wallet-adjustments'; input: WalletAdjustmentInput };

/** Every account action returns the refreshed user, which replaces the cached one. */
export function useUserAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, input }: UserAction) =>
      post<{ user: AdminUserDetail }>(`/admin/users/${id}/${kind}`, input),
    onSuccess: (data) => {
      queryClient.setQueryData(adminUserKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: [...adminUserKeys.all, 'list'] });
    },
  });
}

// ── Attendees ──

export const attendeesQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['admin', 'attendees', eventId],
    queryFn: () => api<AttendeeList>(`/admin/events/${eventId}/attendees`),
  });

/** A plain link: the browser downloads it with the session cookie, no JS needed. */
export const attendeesCsvUrl = (eventId: string) => `/api/admin/events/${eventId}/attendees.csv`;
