import type {
  AcceptInviteInput,
  LoginInput,
  MeResponse,
  Role,
  SessionUser,
  SignupInput,
} from '@spu-events/shared';
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query';
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { api } from '@/lib/api';
import { meKey, queryClient } from '@/lib/query-client';
import { clearOfflineTickets } from '@/lib/tickets';

export const meQuery = queryOptions({
  queryKey: meKey,
  queryFn: () => api<MeResponse>('/auth/me'),
  staleTime: 5 * 60_000,
});

/** The signed-in user, or null. Route loaders have already fetched it, so this rarely suspends. */
export function useSession() {
  const { data, isPending } = useQuery(meQuery);
  return { user: data?.user ?? null, isPending };
}

/** Where each role lands after signing in. */
export function homeFor(role: Role) {
  return { student: '/', staff: '/gate', admin: '/admin' }[role];
}

export function roleLabel(role: Role) {
  return { student: 'Student', staff: 'Gate staff', admin: 'Admin' }[role];
}

export function initials(user: Pick<SessionUser, 'firstName' | 'lastName'>) {
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
}

/** Only same-site paths, so `?next=` can't bounce people to another website. */
export function safeNext(next: string | null) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : null;
}

/**
 * A new identity starts with a clean cache (memory and offline tickets), so one
 * user's data never shows for another on a shared device.
 */
function setSessionUser(data: MeResponse) {
  queryClient.removeQueries();
  clearOfflineTickets();
  queryClient.setQueryData(meKey, data);
}

const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) => post<MeResponse>('/auth/login', input),
    onSuccess: setSessionUser,
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (input: SignupInput) => post<MeResponse>('/auth/signup', input),
    onSuccess: setSessionUser,
  });
}

export function useAcceptInvite(token: string) {
  return useMutation({
    mutationFn: (input: AcceptInviteInput) =>
      post<MeResponse>(`/invites/${encodeURIComponent(token)}/accept`, input),
    onSuccess: setSessionUser,
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => post<void>('/auth/logout'),
    onSuccess: () => setSessionUser({ user: null }),
  });
}

/**
 * Route guard. Signed-out visitors go to /login and come back afterwards;
 * signed-in users without the right role go to their own home.
 */
export function requireUser(roles?: Role[]) {
  return async ({ request }: LoaderFunctionArgs) => {
    const { user } = await queryClient.ensureQueryData(meQuery);
    if (!user) {
      const { pathname, search } = new URL(request.url);
      throw redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
    }
    if (roles && !roles.includes(user.role)) throw redirect(homeFor(user.role));
    return null;
  };
}

/** Keeps signed-in users off the login and sign-up pages. */
export async function redirectIfSignedIn() {
  const { user } = await queryClient.ensureQueryData(meQuery);
  if (user) throw redirect(homeFor(user.role));
  return null;
}
