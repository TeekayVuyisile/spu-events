import type { EventDetail, EventLocation, PlaceSuggestion } from '@spu-events/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/query-client';
import { EventPage } from '@/routes/event';
import { json, mockFetch, renderRoute } from '@/test/render';
import { LocationPicker } from './location-picker';

// Leaflet needs a real browser layout; stand in a pin that can be "dragged" with a button.
vi.mock('@/components/maps/map-view', () => ({
  MapView: ({
    lat,
    lng,
    onMove,
  }: {
    lat: number;
    lng: number;
    onMove?: (a: number, b: number) => void;
  }) => (
    <div data-testid="map">
      {lat},{lng}
      {onMove && <button onClick={() => onMove(-28.75, 24.77)}>drag pin</button>}
    </div>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const CENTRAL: PlaceSuggestion = {
  id: 'W1',
  name: 'Sol Plaatje University (Central Campus)',
  address: 'Bultfontein Road, Kimberley, Northern Cape',
  lat: -28.7477,
  lng: 24.765,
};

function Harness({ onPick }: { onPick: (p: PlaceSuggestion) => void }) {
  const [value, setValue] = useState<EventLocation | null>(null);
  return (
    <>
      <LocationPicker value={value} onChange={setValue} onPick={onPick} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const value = () => JSON.parse(screen.getByTestId('value').textContent!);

describe('LocationPicker', () => {
  it('suggests places as you type, picks with the keyboard, and moves the pin', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch(() => json(200, { places: [CENTRAL] }));
    const onPick = vi.fn();
    renderRoute('/', <Harness onPick={onPick} />, '/');

    const box = screen.getByRole('combobox', { name: 'Search for a place' });
    await user.type(box, 'central campus');
    expect(await screen.findByRole('option', { name: /Central Campus/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe('/api/admin/places?q=central+campus');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(value()).toEqual({
      lat: -28.7477,
      lng: 24.765,
      address:
        'Sol Plaatje University (Central Campus), Bultfontein Road, Kimberley, Northern Cape',
    });
    expect(onPick).toHaveBeenCalledWith(CENTRAL);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'drag pin' }));
    expect(value()).toMatchObject({ lat: -28.75, lng: 24.77 });

    await user.click(screen.getByRole('button', { name: /Remove pin/ }));
    expect(value()).toBeNull();
  });

  it('shows the server’s advice when search is down, and can drop a pin on campus', async () => {
    const user = userEvent.setup();
    mockFetch(() =>
      json(502, {
        error: {
          code: 'GEOCODER_UNAVAILABLE',
          message: 'Place search isn’t working right now. Drop the pin on campus instead.',
        },
      }),
    );
    renderRoute('/', <Harness onPick={vi.fn()} />, '/');

    await user.type(screen.getByRole('combobox'), 'great hall');
    expect(await screen.findByText(/Place search isn’t working/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Drop a pin on campus/ }));
    expect(value()).toMatchObject({ lat: -28.7477, lng: 24.765 });
  });
});

describe('event page location', () => {
  it('shows the map with Google Maps links when the event has a pin', async () => {
    const event: EventDetail = {
      id: '00000000-0000-4000-8000-0000000000e1',
      slug: 'jazz-on-the-lawn-ab12',
      title: 'Jazz on the Lawn',
      category: 'music',
      venue: 'Central Lawn',
      startsAt: '2030-10-24T14:00:00.000Z',
      endsAt: '2030-10-24T17:00:00.000Z',
      priceCents: 0,
      capacity: 100,
      ticketsSold: 0,
      likeCount: 0,
      status: 'published',
      coverUrl: null,
      description: '',
      location: { lat: -28.7471, lng: 24.7643, address: 'Central Campus, Kimberley' },
      volunteersWanted: false,
      cancelledAt: null,
      cancellationReason: null,
      myTicketId: null,
      likedByMe: false,
    };
    mockFetch((url) =>
      url.startsWith('/api/events/jazz')
        ? json(200, { event })
        : url.endsWith('/auth/me')
          ? json(200, { user: null })
          : json(200, { comments: [], photos: [], nextCursor: null }),
    );
    renderRoute('/events/:slug', <EventPage />, '/events/jazz-on-the-lawn-ab12');

    expect(await screen.findByRole('heading', { name: 'Getting there' })).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveTextContent('-28.7471,24.7643');
    expect(screen.getByRole('link', { name: /Open in Google Maps/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=-28.7471,24.7643',
    );
    expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=-28.7471,24.7643',
    );
  });
});
