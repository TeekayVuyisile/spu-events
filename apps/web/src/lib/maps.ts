import type { EventLocation, PlaceSuggestion } from '@spu-events/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

type Point = Pick<EventLocation, 'lat' | 'lng'>;

/** Opens the spot in Google Maps (the app on phones, the website elsewhere). */
export const googleMapsUrl = ({ lat, lng }: Point) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Directions from wherever the student is to the pin. */
export const directionsUrl = ({ lat, lng }: Point) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/** Admin place search for the location picker. */
export const placesQuery = (q: string) =>
  queryOptions({
    queryKey: ['admin', 'places', q.toLowerCase()],
    queryFn: () =>
      api<{ places: PlaceSuggestion[] }>(`/admin/places?${new URLSearchParams({ q })}`),
    select: (data) => data.places,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
