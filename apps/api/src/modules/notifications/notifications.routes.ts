import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import type { NotificationsService } from './notifications.service';

const pageQuery = z.object({ cursor: z.string().max(200).optional() });
const markBody = z.object({ ids: z.array(z.uuid()).max(100).optional() });

export function notificationsController(service: NotificationsService) {
  const list: RequestHandler = async (_req, res) => {
    res.json(await service.list(res.locals.user!.id, res.locals.valid.query.cursor));
  };
  const unread: RequestHandler = async (_req, res) => {
    res.json({ unreadCount: await service.unreadCount(res.locals.user!.id) });
  };
  const markRead: RequestHandler = async (_req, res) => {
    res.json(await service.markRead(res.locals.user!.id, res.locals.valid.body.ids));
  };
  return { list, unread, markRead };
}

/** Mounted at /api/notifications. Every signed-in user has an inbox. */
export function notificationsRoutes(service: NotificationsService) {
  const c = notificationsController(service);
  const router = Router();
  router.use(requireAuth);
  router.get('/', validate('query', pageQuery), c.list);
  router.get('/unread-count', c.unread);
  router.post('/read', validate('body', markBody), c.markRead);
  return router;
}
