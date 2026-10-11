import { TICKET_SCOPES } from '@monthati/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ticketsController } from './tickets.controller';
import type { TicketsService } from './tickets.service';

const idParams = z.object({ id: z.uuid('Invalid id') });
const listQuery = z.object({ scope: z.enum(TICKET_SCOPES).default('upcoming').catch('upcoming') });

/** Mounted at /api/tickets. A student's own tickets. */
export function ticketsRoutes(tickets: TicketsService) {
  const c = ticketsController(tickets);
  const router = Router();

  router.use(requireRole('student'));
  router.get('/', validate('query', listQuery), c.list);
  router.get('/:id', validate('params', idParams), c.get);
  router.post('/:id/cancel', validate('params', idParams), c.cancel);

  return router;
}

/** POST /api/events/:id/tickets: buy (or claim, if free) a ticket in one step. */
export function purchaseRoute(tickets: TicketsService): RequestHandler[] {
  return [
    requireRole('student'),
    validate('params', idParams),
    ticketsController(tickets).purchase,
  ];
}
