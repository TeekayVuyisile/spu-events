import type { RequestHandler } from 'express';
import type { TicketsService } from './tickets.service';

export function ticketsController(tickets: TicketsService) {
  const list: RequestHandler = async (_req, res) => {
    res.json({
      tickets: await tickets.listMine(res.locals.user!.id, res.locals.valid.query.scope),
    });
  };
  const get: RequestHandler = async (_req, res) => {
    res.json({ ticket: await tickets.getMine(res.locals.user!.id, res.locals.valid.params.id) });
  };
  const cancel: RequestHandler = async (_req, res) => {
    res.json({ ticket: await tickets.cancelMine(res.locals.user!.id, res.locals.valid.params.id) });
  };
  /** The event id comes from the URL: POST /api/events/:id/tickets. */
  const purchase: RequestHandler = async (_req, res) => {
    res
      .status(201)
      .json({ ticket: await tickets.purchase(res.locals.user!.id, res.locals.valid.params.id) });
  };
  return { list, get, cancel, purchase };
}
