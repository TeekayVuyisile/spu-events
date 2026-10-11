import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import type { AttendeesService } from './attendees.service';

const idParams = z.object({ id: z.uuid('Invalid event id') });

/** Mounted at /api/admin: an event's attendee list, as JSON or a CSV download. */
export function adminAttendeesRoutes(attendees: AttendeesService) {
  const router = Router();
  const byId = validate('params', idParams);

  router.use(requireRole('admin'));
  router.get('/events/:id/attendees', byId, async (_req, res) => {
    res.json(await attendees.list(res.locals.valid.params.id));
  });
  router.get('/events/:id/attendees.csv', byId, async (_req, res) => {
    const { filename, body } = await attendees.csv(res.locals.valid.params.id);
    res
      .type('text/csv; charset=utf-8')
      .attachment(filename)
      .set('Cache-Control', 'no-store')
      // A BOM so Excel reads the file as UTF-8 (names with accents stay intact).
      .send(`\uFEFF${body}`);
  });
  return router;
}
