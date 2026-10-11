import type { Ticket, TicketDetail, TicketScope } from '@monthati/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { eventKeys } from '@/lib/events';
import { walletKey } from '@/lib/wallet';

export const ticketKeys = {
  all: ['tickets'] as const,
  list: (scope: TicketScope) => ['tickets', 'list', scope] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
};

// ── Offline copies ───────────────────────────────────────────
// A ticket that has been opened once stays viewable (QR included) without a
// connection, which is exactly when students need it: in a queue with no signal.

const OFFLINE_PREFIX = 'mth.ticket.';

function readOffline(id: string): TicketDetail | undefined {
  try {
    const raw = localStorage.getItem(OFFLINE_PREFIX + id);
    return raw ? (JSON.parse(raw) as TicketDetail) : undefined;
  } catch {
    return undefined;
  }
}

function saveOffline(ticket: TicketDetail) {
  try {
    if (ticket.status === 'valid')
      localStorage.setItem(OFFLINE_PREFIX + ticket.id, JSON.stringify(ticket));
    else localStorage.removeItem(OFFLINE_PREFIX + ticket.id);
  } catch {
    // Storage full or blocked: the ticket still works online.
  }
}

/** Called on sign-out so the next person on a shared device can't open these tickets. */
export function clearOfflineTickets() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(OFFLINE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing stored.
  }
}

export const ticketsQuery = (scope: TicketScope) =>
  queryOptions({
    queryKey: ticketKeys.list(scope),
    queryFn: () => api<{ tickets: Ticket[] }>(`/tickets?scope=${scope}`),
    select: (data) => data.tickets,
  });

export const ticketQuery = (id: string) =>
  queryOptions({
    queryKey: ticketKeys.detail(id),
    queryFn: async () => {
      const { ticket } = await api<{ ticket: TicketDetail }>(`/tickets/${id}`);
      saveOffline(ticket);
      return ticket;
    },
    // Show the offline copy at once, then refresh it from the API.
    initialData: () => readOffline(id),
    initialDataUpdatedAt: 0,
  });

/** After buying or cancelling, every view of tickets, the wallet and the event is out of date. */
function useInvalidateAfterTicketChange() {
  const queryClient = useQueryClient();
  return (ticket: TicketDetail) => {
    queryClient.setQueryData(ticketKeys.detail(ticket.id), ticket);
    saveOffline(ticket);
    void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    void queryClient.invalidateQueries({ queryKey: walletKey });
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    // A ticket change always comes with a notification.
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function usePurchase(eventId: string) {
  const done = useInvalidateAfterTicketChange();
  return useMutation({
    mutationFn: () =>
      api<{ ticket: TicketDetail }>(`/events/${eventId}/tickets`, { method: 'POST' }),
    onSuccess: ({ ticket }) => done(ticket),
  });
}

export function useCancelTicket(id: string) {
  const done = useInvalidateAfterTicketChange();
  return useMutation({
    mutationFn: () => api<{ ticket: TicketDetail }>(`/tickets/${id}/cancel`, { method: 'POST' }),
    onSuccess: ({ ticket }) => done(ticket),
  });
}
