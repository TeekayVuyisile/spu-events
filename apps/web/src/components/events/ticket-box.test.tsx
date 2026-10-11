import type { EventDetail, MeResponse, SessionUser } from '@monthati/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meKey, queryClient } from '@/lib/query-client';
import { json, mockFetch, renderRoute } from '@/test/render';
import { TicketBox } from './ticket-box';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const student: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'student',
  firstName: 'Lerato',
  lastName: 'Mokoena',
  email: 'lerato@spu.ac.za',
  studentNumber: '202312345',
  avatarUrl: null,
};

const event = (overrides: Partial<EventDetail> = {}): EventDetail => ({
  id: '00000000-0000-4000-8000-0000000000e1',
  slug: 'spring-formal-ab12',
  title: 'Spring Formal',
  category: 'party',
  venue: 'Great Hall',
  startsAt: '2030-10-24T17:00:00.000Z',
  endsAt: '2030-10-24T21:00:00.000Z',
  priceCents: 15000,
  capacity: 100,
  ticketsSold: 40,
  likeCount: 0,
  status: 'published',
  coverUrl: null,
  description: '',
  volunteersWanted: false,
  cancelledAt: null,
  cancellationReason: null,
  myTicketId: null,
  likedByMe: false,
  ...overrides,
});

function renderBox(e: EventDetail, user: SessionUser | null = student) {
  queryClient.setQueryData<MeResponse>(meKey, { user });
  return renderRoute('/events/:slug', <TicketBox event={e} />, `/events/${e.slug}`);
}

describe('TicketBox', () => {
  it('asks signed-out visitors to log in and come back', () => {
    renderBox(event(), null);
    expect(screen.getByRole('link', { name: 'Log in to get a ticket' })).toHaveAttribute(
      'href',
      '/login?next=%2Fevents%2Fspring-formal-ab12',
    );
  });

  it('disables buying when sold out', () => {
    renderBox(event({ ticketsSold: 100 }));
    expect(screen.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  });

  it('warns when few spots are left', () => {
    renderBox(event({ ticketsSold: 96 }));
    expect(screen.getByText(/Only/)).toHaveTextContent('Only 4 left');
  });

  it('links to the ticket the student already holds', () => {
    renderBox(event({ myTicketId: 't1' }));
    expect(screen.getByRole('link', { name: /View your ticket/ })).toHaveAttribute(
      'href',
      '/tickets/t1',
    );
  });

  it('shows the balance after buying and sends the student to top up when short', async () => {
    mockFetch(() => json(200, { balanceCents: 10000, entries: [] }));
    renderBox(event());

    await userEvent.click(screen.getByRole('button', { name: /Get ticket/ }));
    expect(await screen.findByText(/You need R\s?50[,.]00 more\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Top up/ })).toHaveAttribute('href', '/wallet');
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('buys and opens the new ticket', async () => {
    const fetch = mockFetch((url) =>
      url === '/api/wallet'
        ? json(200, { balanceCents: 20000, entries: [] })
        : json(201, { ticket: { id: 'new-ticket', status: 'valid' } }),
    );
    const router = renderBox(event());

    await userEvent.click(screen.getByRole('button', { name: /Get ticket/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Pay R\s?150[,.]00/ }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/tickets/new-ticket'));
    expect(router.state.location.state).toEqual({ justIssued: true });
    expect(fetch).toHaveBeenCalledWith(
      '/api/events/00000000-0000-4000-8000-0000000000e1/tickets',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
