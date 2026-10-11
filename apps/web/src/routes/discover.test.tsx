import type { EventSummary } from '@monthati/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/query-client';
import { json, mockFetch, renderRoute } from '@/test/render';
import { DiscoverPage } from './discover';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const event = (title: string, priceCents: number): EventSummary => ({
  id: crypto.randomUUID(),
  slug: title.toLowerCase().replace(/ /g, '-'),
  title,
  category: 'music',
  venue: 'Great Hall',
  startsAt: '2030-10-24T17:00:00.000Z',
  endsAt: '2030-10-24T21:00:00.000Z',
  priceCents,
  capacity: 100,
  status: 'published',
  coverUrl: null,
});

describe('DiscoverPage', () => {
  it('lists events with their price in rands', async () => {
    mockFetch(() =>
      json(200, {
        events: [event('Jazz Night', 0), event('Spring Formal', 15000)],
        nextPage: null,
      }),
    );
    renderRoute('/', <DiscoverPage />, '/');

    expect(await screen.findByRole('heading', { name: 'Jazz Night' })).toBeInTheDocument();
    const jazz = screen.getByRole('link', { name: /Jazz Night/ });
    expect(within(jazz).getByText('Free')).toBeInTheDocument();
    const formal = screen.getByRole('link', { name: /Spring Formal/ });
    expect(within(formal).getByText(/R\s?150[,.]00/)).toBeInTheDocument();
    expect(formal).toHaveAttribute('href', '/events/spring-formal');
  });

  it('puts filters in the URL and refetches with them', async () => {
    const fetch = mockFetch(() => json(200, { events: [], nextPage: null }));
    const router = renderRoute('/', <DiscoverPage />, '/');
    await screen.findByText('No events yet');

    await userEvent.click(screen.getByRole('button', { name: 'Sport' }));
    await userEvent.click(screen.getByRole('button', { name: 'Free' }));

    await vi.waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/events?category=sport&price=free&when=upcoming&page=1',
        expect.anything(),
      ),
    );
    expect(router.state.location.search).toBe('?category=sport&price=free');
    expect(await screen.findByText('Nothing matches those filters')).toBeInTheDocument();
  });

  it('reads filters from a shared link', async () => {
    const fetch = mockFetch(() => json(200, { events: [], nextPage: null }));
    renderRoute('/', <DiscoverPage />, '/?when=past&q=jazz');

    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/events?q=jazz&when=past&page=1', expect.anything()),
    );
    expect(screen.getByRole('button', { name: 'Past' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Search events')).toHaveValue('jazz');
  });
});
