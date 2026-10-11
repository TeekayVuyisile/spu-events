import type {
  GateEvent,
  GateStats,
  LiveGateUpdate,
  ScanInput,
  ScanLogEntry,
  ScanResult,
  StaffMember,
} from '@monthati/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface GateOverview {
  event: GateEvent;
  stats: GateStats;
  recent: ScanLogEntry[];
}

export const gateKeys = {
  events: ['gate', 'events'] as const,
  overview: (eventId: string) => ['gate', 'overview', eventId] as const,
  staff: ['admin', 'staff'] as const,
  eventStaff: (eventId: string) => ['admin', 'events', 'staff', eventId] as const,
};

export const gateEventsQuery = queryOptions({
  queryKey: gateKeys.events,
  queryFn: () => api<{ events: GateEvent[] }>('/gate/events'),
  select: (d) => d.events,
});

export const gateOverviewQuery = (eventId: string) =>
  queryOptions({
    queryKey: gateKeys.overview(eventId),
    queryFn: () => api<GateOverview>(`/gate/events/${eventId}`),
  });

/** Applies one scan to the cached overview: new stats, newest scan first (max 20). */
function applyUpdate(old: GateOverview | undefined, update: LiveGateUpdate) {
  if (!old) return old;
  if (old.recent.some((s) => s.id === update.scan.id)) return { ...old, stats: update.stats };
  return { ...old, stats: update.stats, recent: [update.scan, ...old.recent].slice(0, 20) };
}

export function useScan(eventId: string) {
  return useMutation({
    mutationFn: (input: ScanInput) =>
      api<ScanResult>(`/gate/events/${eventId}/scan`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

/**
 * Subscribes to the event's Server-Sent Events stream and merges each update into
 * the overview cache. EventSource reconnects by itself; after a reconnect we
 * refetch once, in case updates were missed while disconnected.
 */
export function useLiveGate(eventId: string) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/gate/events/${eventId}/live`, { withCredentials: true });
    let opened = false;

    source.onopen = () => {
      setConnected(true);
      if (opened) void queryClient.invalidateQueries({ queryKey: gateKeys.overview(eventId) });
      opened = true;
    };
    source.onerror = () => setConnected(false);
    source.addEventListener('update', (e) => {
      const update = JSON.parse((e as MessageEvent<string>).data) as LiveGateUpdate;
      queryClient.setQueryData<GateOverview>(gateKeys.overview(eventId), (old) =>
        applyUpdate(old, update),
      );
    });

    return () => source.close();
  }, [eventId, queryClient]);

  return { connected };
}

// ── Admin: staff assignment ──

export const staffQuery = queryOptions({
  queryKey: gateKeys.staff,
  queryFn: () => api<{ staff: StaffMember[] }>('/admin/staff'),
  select: (d) => d.staff,
});

export const eventStaffQuery = (eventId: string) =>
  queryOptions({
    queryKey: gateKeys.eventStaff(eventId),
    queryFn: () => api<{ staff: StaffMember[] }>(`/admin/events/${eventId}/staff`),
    select: (d) => d.staff,
  });

export function useAssignStaff(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) =>
      api<{ staff: StaffMember[] }>(`/admin/events/${eventId}/staff`, {
        method: 'PUT',
        body: JSON.stringify({ userIds }),
      }),
    onSuccess: (data) => queryClient.setQueryData(gateKeys.eventStaff(eventId), data),
  });
}

// ── This device's gate name ("Gate B"), remembered between shifts ──

const GATE_NAME_KEY = 'mth.gate.name';

export function readGateName() {
  try {
    return localStorage.getItem(GATE_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveGateName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(GATE_NAME_KEY, name.trim());
    else localStorage.removeItem(GATE_NAME_KEY);
  } catch {
    // Not critical: the gate name is a convenience.
  }
}
