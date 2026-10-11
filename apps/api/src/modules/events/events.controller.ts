import type { RequestHandler } from 'express';
import type { EventsService } from './events.service';

export function eventsController(events: EventsService) {
  const id = (res: Parameters<RequestHandler>[1]) => res.locals.valid.params.id as string;

  // ── Public ──
  const listPublished: RequestHandler = async (_req, res) => {
    res.json(await events.listPublished(res.locals.valid.query));
  };
  const getPublished: RequestHandler = async (_req, res) => {
    res.json({
      event: await events.getPublished(res.locals.valid.params.slug, res.locals.user?.id),
    });
  };

  // ── Admin ──
  const list: RequestHandler = async (_req, res) => {
    res.json({ events: await events.listForAdmin(res.locals.valid.query) });
  };
  const get: RequestHandler = async (_req, res) => {
    res.json({ event: await events.get(id(res)) });
  };
  const create: RequestHandler = async (_req, res) => {
    res
      .status(201)
      .json({ event: await events.create(res.locals.valid.body, res.locals.user!.id) });
  };
  const update: RequestHandler = async (_req, res) => {
    res.json({ event: await events.update(id(res), res.locals.valid.body) });
  };
  const publish: RequestHandler = async (_req, res) => {
    res.json({ event: await events.publish(id(res)) });
  };
  const unpublish: RequestHandler = async (_req, res) => {
    res.json({ event: await events.unpublish(id(res)) });
  };
  const cancel: RequestHandler = async (_req, res) => {
    res.json({ event: await events.cancel(id(res), res.locals.valid.body.reason) });
  };
  const duplicate: RequestHandler = async (_req, res) => {
    res.status(201).json({ event: await events.duplicate(id(res), res.locals.user!.id) });
  };
  const remove: RequestHandler = async (_req, res) => {
    await events.remove(id(res));
    res.status(204).end();
  };
  const setCover: RequestHandler = async (req, res) => {
    res.json({ event: await events.setCover(id(res), req.file!.buffer) });
  };
  const removeCover: RequestHandler = async (_req, res) => {
    res.json({ event: await events.removeCover(id(res)) });
  };

  return {
    listPublished,
    getPublished,
    list,
    get,
    create,
    update,
    publish,
    unpublish,
    cancel,
    duplicate,
    remove,
    setCover,
    removeCover,
  };
}
