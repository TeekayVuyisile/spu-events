import type { PlaceSuggestion } from '@spu-events/shared';
import { describe, expect, it } from 'vitest';
import { fakeGeocoder, photonGeocoder, toSuggestions, type Geocoder } from '../src/lib/geocoder';
import { buildApp, signedIn, useTestDb } from './helpers';

useTestDb();

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, hours = 0) =>
  new Date(Date.now() + days * DAY + hours * 3600_000).toISOString();

const CENTRAL: PlaceSuggestion = {
  id: 'W1',
  name: 'Sol Plaatje University (Central Campus)',
  address: 'Bultfontein Road, Kimberley, Northern Cape',
  lat: -28.7477,
  lng: 24.765,
};

const pin = {
  lat: CENTRAL.lat,
  lng: CENTRAL.lng,
  address: `${CENTRAL.name}, ${CENTRAL.address}`,
};

const input = (overrides: object = {}) => ({
  title: 'Jazz on the Lawn',
  category: 'music',
  venue: 'Central Lawn',
  startsAt: inDays(7),
  endsAt: inDays(7, 3),
  capacity: 100,
  priceCents: 0,
  ...overrides,
});

describe('place search', () => {
  it('answers admins from the geocoder', async () => {
    const geocoder = fakeGeocoder([CENTRAL]);
    const { agent } = await signedIn('admin', buildApp({ geocoder }));

    const res = await agent.get('/api/admin/places').query({ q: 'central campus' });
    expect(res.status).toBe(200);
    expect(res.body.places).toEqual([CENTRAL]);
    expect(geocoder.calls).toEqual(['central campus']);
  });

  it('is for admins only and needs at least 3 characters', async () => {
    const app = buildApp({ geocoder: fakeGeocoder([CENTRAL]) });
    const { agent: student } = await signedIn('student', app);
    expect((await student.get('/api/admin/places').query({ q: 'sol' })).status).toBe(403);

    const { agent: admin } = await signedIn('admin', app);
    const short = await admin.get('/api/admin/places').query({ q: 'so' });
    expect(short.status).toBe(400);
    expect(short.body.error.fields.q).toBeDefined();
  });

  it('explains what to do when the geocoder is down', async () => {
    const geocoder = photonGeocoder({
      userAgent: 'test',
      fetchImpl: async () => new Response('busy', { status: 503 }),
    });
    const { agent } = await signedIn('admin', buildApp({ geocoder }));
    const res = await agent.get('/api/admin/places').query({ q: 'kimberley' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GEOCODER_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/drag it into place/);
  });
});

describe('Photon geocoder', () => {
  it('biases towards campus inside South Africa, and caches repeated searches', async () => {
    const urls: URL[] = [];
    const geocoder: Geocoder = photonGeocoder({
      userAgent: 'spu-events/test',
      fetchImpl: async (url) => {
        urls.push(new URL(String(url)));
        return Response.json({
          features: [
            {
              geometry: { coordinates: [24.765, -28.7477] },
              properties: {
                osm_type: 'W',
                osm_id: 1,
                name: 'Sol Plaatje University (Central Campus)',
                street: 'Bultfontein Road',
                city: 'Kimberley',
                state: 'Northern Cape',
              },
            },
          ],
        });
      },
    });

    const first = await geocoder.search('Sol Plaatje');
    await geocoder.search('sol plaatje');
    expect(first).toEqual([CENTRAL]);
    expect(urls).toHaveLength(1);
    expect(urls[0]!.searchParams.get('bbox')).toBe('16.3,-34.9,33.0,-22.1');
    expect(urls[0]!.searchParams.get('lat')).toBe('-28.7477');
  });

  it('labels streets without a name, drops repeats, repeated parts and ward numbers', () => {
    const places = toSuggestions([
      {
        geometry: { coordinates: [24.7651, -28.7469] },
        properties: { osm_type: 'W', osm_id: 2, street: 'Bultfontein Road', city: 'Kimberley' },
      },
      {
        geometry: { coordinates: [24.7661, -28.748] },
        properties: { osm_type: 'W', osm_id: 3, street: 'Bultfontein Road', city: 'Kimberley' },
      },
      {
        geometry: { coordinates: [24.7585, -28.7391] },
        properties: { osm_id: 4, name: 'Big Hole', district: 'Kimberley', city: 'Kimberley' },
      },
      {
        geometry: { coordinates: [24.7547, -28.7407] },
        properties: {
          osm_id: 5,
          name: 'Visitor Centre',
          street: 'West Circular Road',
          district: 'Sol Plaatje Ward 20',
          city: 'Kimberley',
        },
      },
      { geometry: { coordinates: [0, 0] }, properties: {} },
    ]);
    expect(places.map((p) => [p.name, p.address])).toEqual([
      ['Bultfontein Road', 'Kimberley'],
      ['Big Hole', 'Kimberley'],
      ['Visitor Centre', 'West Circular Road, Kimberley'],
    ]);
  });
});

describe('event locations', () => {
  it('saves, returns, duplicates and clears the map pin', async () => {
    const { agent } = await signedIn('admin');
    const created = await agent.post('/api/admin/events').send(input({ location: pin }));
    expect(created.status).toBe(201);
    expect(created.body.event.location).toEqual(pin);

    const id = created.body.event.id;
    await agent.post(`/api/admin/events/${id}/publish`).expect(200);
    const page = await agent.get(`/api/events/${created.body.event.slug}`);
    expect(page.body.event.location).toEqual(pin);

    const copy = await agent.post(`/api/admin/events/${id}/duplicate`);
    expect(copy.body.event.location).toEqual(pin);

    const cleared = await agent.put(`/api/admin/events/${id}`).send(input({ location: null }));
    expect(cleared.body.event.location).toBeNull();
  });

  it('defaults to no pin and rejects coordinates without an address or out of range', async () => {
    const { agent } = await signedIn('admin');
    const plain = await agent.post('/api/admin/events').send(input());
    expect(plain.body.event.location).toBeNull();

    const partial = await agent
      .post('/api/admin/events')
      .send(input({ location: { lat: -28.7, lng: 24.7 } }));
    expect(partial.status).toBe(400);
    const wild = await agent
      .post('/api/admin/events')
      .send(input({ location: { ...pin, lat: 120 } }));
    expect(wild.status).toBe(400);
  });

  it('tells ticket holders when the pin moves', async () => {
    const app = buildApp();
    const { agent: admin } = await signedIn('admin', app);
    const event = (await admin.post('/api/admin/events').send(input({ location: pin }))).body.event;
    await admin.post(`/api/admin/events/${event.id}/publish`).expect(200);

    const { agent: student } = await signedIn('student', app);
    await student.post(`/api/events/${event.id}/tickets`).expect(201);

    await admin
      .put(`/api/admin/events/${event.id}`)
      .send(input({ location: { ...pin, lat: pin.lat + 0.004 } }))
      .expect(200);
    const inbox = (await student.get('/api/notifications')).body.notifications;
    expect(inbox.map((n: { kind: string }) => n.kind)).toContain('event_changed');
  });
});
