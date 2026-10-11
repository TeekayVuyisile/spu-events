import { z } from 'zod';

/** Sol Plaatje University, Central Campus (Bultfontein Road, Kimberley). */
export const CAMPUS_CENTER = { lat: -28.7477, lng: 24.765 } as const;

/** Admin place search for pinning an event on the map. */
export const placeSearchQuerySchema = z.object({
  q: z.string().trim().min(3, 'Type at least 3 characters').max(120),
});
export type PlaceSearchQuery = z.infer<typeof placeSearchQuerySchema>;

export interface PlaceSuggestion {
  id: string;
  /** The place itself ("Sol Plaatje University (Central Campus)"), or the street. */
  name: string;
  /** Where it is ("Bultfontein Road, Kimberley, Northern Cape"). */
  address: string;
  lat: number;
  lng: number;
}
