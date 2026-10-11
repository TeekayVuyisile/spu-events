import type {
  ModerationActionInput,
  ModerationItem,
  NotificationPage,
  ReportInput,
  ReportTarget,
  VolunteerApplicant,
  VolunteerApplication,
  VolunteerApplyInput,
} from '@monthati/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';

const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

// ── Notifications ──

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
};

/** Polled once a minute while the tab is open; cheap (one indexed count). */
export const unreadCountQuery = queryOptions({
  queryKey: notificationKeys.unread,
  queryFn: () => api<{ unreadCount: number }>('/notifications/unread-count'),
  select: (d) => d.unreadCount,
  refetchInterval: 60_000,
});

export const notificationsQuery = infiniteQueryOptions({
  queryKey: notificationKeys.list,
  queryFn: ({ pageParam }) =>
    api<NotificationPage>(
      pageParam ? `/notifications?cursor=${encodeURIComponent(pageParam)}` : '/notifications',
    ),
  initialPageParam: null as string | null,
  getNextPageParam: (last) => last.nextCursor,
});

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => post<{ unreadCount: number }>('/notifications/read', { ids }),
    onSuccess: ({ unreadCount }) => {
      queryClient.setQueryData(notificationKeys.unread, { unreadCount });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list });
    },
  });
}

// ── Volunteering ──

export const volunteerKeys = {
  mine: (eventId: string) => ['volunteer', 'mine', eventId] as const,
  applicants: (eventId: string) => ['admin', 'volunteers', eventId] as const,
};

export const myApplicationQuery = (eventId: string) =>
  queryOptions({
    queryKey: volunteerKeys.mine(eventId),
    queryFn: () =>
      api<{ application: VolunteerApplication | null }>(`/events/${eventId}/volunteer`),
    select: (d) => d.application,
  });

export function useVolunteer(eventId: string) {
  const queryClient = useQueryClient();
  const set = (data: { application: VolunteerApplication | null }) =>
    queryClient.setQueryData(volunteerKeys.mine(eventId), data);

  const apply = useMutation({
    mutationFn: (input: VolunteerApplyInput) =>
      post<{ application: VolunteerApplication }>(`/events/${eventId}/volunteer`, input),
    onSuccess: set,
  });
  const withdraw = useMutation({
    mutationFn: () =>
      api<{ application: VolunteerApplication }>(`/events/${eventId}/volunteer`, {
        method: 'DELETE',
      }),
    onSuccess: set,
  });
  return { apply, withdraw };
}

export const applicantsQuery = (eventId: string) =>
  queryOptions({
    queryKey: volunteerKeys.applicants(eventId),
    queryFn: () => api<{ applicants: VolunteerApplicant[] }>(`/admin/events/${eventId}/volunteers`),
    select: (d) => d.applicants,
  });

export function useDecideVolunteers(eventId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: volunteerKeys.applicants(eventId) });
  const one = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accept' | 'decline' }) =>
      post(`/admin/volunteers/${id}/decision`, { decision }),
    onSuccess: refresh,
  });
  const all = useMutation({
    mutationFn: (decision: 'accept' | 'decline') =>
      post<{ decided: number }>(`/admin/events/${eventId}/volunteers/decide-all`, { decision }),
    onSuccess: refresh,
  });
  return { one, all };
}

// ── Reports and moderation ──

export function useReport() {
  return useMutation({ mutationFn: (input: ReportInput) => post('/reports', input) });
}

export const moderationKeys = {
  queue: ['admin', 'moderation'] as const,
  count: ['admin', 'moderation', 'count'] as const,
};

export const moderationQuery = queryOptions({
  queryKey: moderationKeys.queue,
  queryFn: () => api<{ items: ModerationItem[] }>('/admin/moderation'),
  select: (d) => d.items,
});

export const moderationCountQuery = queryOptions({
  queryKey: moderationKeys.count,
  queryFn: () => api<{ count: number }>('/admin/moderation/count'),
  select: (d) => d.count,
  refetchInterval: 60_000,
});

export function useModerate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetType,
      targetId,
      ...input
    }: ModerationActionInput & { targetType: ReportTarget; targetId: string }) =>
      post(`/admin/moderation/${targetType}/${targetId}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moderationKeys.queue });
      // Removed comments and photos disappear from event pages too.
      void queryClient.invalidateQueries({ queryKey: ['social'] });
    },
  });
}
