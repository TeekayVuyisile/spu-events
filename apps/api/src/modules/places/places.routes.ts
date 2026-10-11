import { placeSearchQuerySchema } from '@spu-events/shared';
import { Router } from 'express';
import { AppError } from '../../lib/errors';
import { GeocoderUnavailableError, type Geocoder } from '../../lib/geocoder';
import { requireRole } from '../../middleware/auth';
import { userRateLimit } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';

/** Mounted at /api/admin/places. Search-as-you-type for pinning an event on the map. */
export function placesRoutes(geocoder: Geocoder, { limitsEnabled }: { limitsEnabled: boolean }) {
  const router = Router();
  router.use(requireRole('admin'));
  router.get(
    '/',
    // The editor debounces typing; this stops anything runaway from hammering a free service.
    userRateLimit({ enabled: limitsEnabled, windowMs: 60_000, limit: 60 }),
    validate('query', placeSearchQuerySchema),
    async (_req, res) => {
      try {
        res.json({ places: await geocoder.search(res.locals.valid.query.q) });
      } catch (err) {
        if (!(err instanceof GeocoderUnavailableError)) throw err;
        throw new AppError(
          502,
          'GEOCODER_UNAVAILABLE',
          'Place search isn’t working right now. Drop the pin on campus and drag it into place instead.',
        );
      }
    },
  );
  return router;
}
