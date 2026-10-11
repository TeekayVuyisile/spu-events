import {
  adminEventListQuerySchema,
  cancelEventSchema,
  eventInputSchema,
  eventListQuerySchema,
} from '@spu-events/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { singleImage } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import { eventsController } from './events.controller';
import type { EventsService } from './events.service';

const idParams = z.object({ id: z.uuid('Invalid event id') });
const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

/** Mounted at /api/events. Public, no sign-in needed. */
export function publicEventsRoutes(events: EventsService) {
  const c = eventsController(events);
  const router = Router();

  router.get('/', validate('query', eventListQuerySchema), c.listPublished);
  router.get('/:slug', validate('params', slugParams), c.getPublished);

  return router;
}

/** Mounted at /api/admin/events. Admins only. */
export function adminEventsRoutes(events: EventsService) {
  const c = eventsController(events);
  const router = Router();
  const byId = validate('params', idParams);

  router.use(requireRole('admin'));
  router.get('/', validate('query', adminEventListQuerySchema), c.list);
  router.post('/', validate('body', eventInputSchema), c.create);
  router.get('/:id', byId, c.get);
  router.put('/:id', byId, validate('body', eventInputSchema), c.update);
  router.delete('/:id', byId, c.remove);
  router.post('/:id/publish', byId, c.publish);
  router.post('/:id/unpublish', byId, c.unpublish);
  router.post('/:id/cancel', byId, validate('body', cancelEventSchema), c.cancel);
  router.post('/:id/duplicate', byId, c.duplicate);
  router.put('/:id/cover', byId, singleImage('cover'), c.setCover);
  router.delete('/:id/cover', byId, c.removeCover);

  return router;
}
