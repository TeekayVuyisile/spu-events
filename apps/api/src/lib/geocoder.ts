import { CAMPUS_CENTER, type PlaceSuggestion } from '@spu-events/shared';

/**
 * Turns what an admin types into places to pin on the map: Photon (OpenStreetMap
 * data, built for search-as-you-type) in production, a fake in tests.
 */
export interface Geocoder {
  search(q: string): Promise<PlaceSuggestion[]>;
}

/** The upstream service failed or timed out. */
export class GeocoderUnavailableError extends Error {}

export interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
  };
}

// Results stay inside South Africa and lean towards campus, so "Great Hall" finds a nearby one.
const SOUTH_AFRICA_BBOX = '16.3,-34.9,33.0,-22.1';
const CACHE_LIMIT = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function photonGeocoder({
  baseUrl = 'https://photon.komoot.io/api/',
  userAgent,
  fetchImpl = fetch,
}: {
  baseUrl?: string;
  /** Photon's fair-use policy asks clients to identify themselves. */
  userAgent: string;
  fetchImpl?: typeof fetch;
}): Geocoder {
  // Admins retype the same prefixes, so a small cache spares the free public service.
  const cache = new Map<string, { at: number; places: PlaceSuggestion[] }>();

  return {
    async search(q) {
      const key = q.toLowerCase();
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.places;

      const url = new URL(baseUrl);
      url.search = new URLSearchParams({
        q,
        lat: String(CAMPUS_CENTER.lat),
        lon: String(CAMPUS_CENTER.lng),
        zoom: '12',
        location_bias_scale: '0.1',
        bbox: SOUTH_AFRICA_BBOX,
        limit: '6',
        lang: 'en',
      }).toString();

      let body: { features?: PhotonFeature[] };
      try {
        const res = await fetchImpl(url, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error(`Photon responded ${res.status}`);
        body = (await res.json()) as { features?: PhotonFeature[] };
      } catch (err) {
        throw new GeocoderUnavailableError((err as Error).message);
      }

      const places = toSuggestions(body.features ?? []);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), places });
      return places;
    },
  };
}

/** Photon features → "Sol Plaatje University (Central Campus)" + "Bultfontein Road, Kimberley, Northern Cape". */
export function toSuggestions(features: PhotonFeature[]): PlaceSuggestion[] {
  const seen = new Set<string>();
  const places: PlaceSuggestion[] = [];
  for (const { geometry, properties: p } of features) {
    const [lng, lat] = geometry.coordinates;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const name = p.name ?? street;
    if (!name) continue;
    // Municipal wards ("Sol Plaatje Ward 23") mean nothing to students; leave them out.
    const district = p.district && !/\bWard \d+$/.test(p.district) ? p.district : '';
    const parts = [street !== name ? street : '', district, p.city ?? '', p.state ?? ''];
    const address = parts.filter((part, i) => part && parts.indexOf(part) === i).join(', ');
    // OpenStreetMap often maps one place several times (a building and its grounds).
    const label = `${name}|${address}`;
    if (seen.has(label)) continue;
    seen.add(label);
    places.push({
      id: `${p.osm_type ?? 'X'}${p.osm_id ?? places.length}`,
      name,
      address,
      lat,
      lng,
    });
  }
  return places;
}

/** For tests: answers from a fixed list and records what was asked. */
export function fakeGeocoder(places: PlaceSuggestion[] = []) {
  const calls: string[] = [];
  const geocoder: Geocoder = {
    async search(q) {
      calls.push(q);
      return places.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(q.toLowerCase()));
    },
  };
  return Object.assign(geocoder, { calls });
}
