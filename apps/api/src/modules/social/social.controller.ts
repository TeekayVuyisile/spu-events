import type { RequestHandler, Response } from 'express';
import type { Actor, SocialService } from './social.service';

const actor = (res: Response): Actor => ({ id: res.locals.user!.id, role: res.locals.user!.role });
const viewer = (res: Response): Actor | undefined =>
  res.locals.user ? { id: res.locals.user.id, role: res.locals.user.role } : undefined;
const params = (res: Response) => res.locals.valid.params as { id: string; kind?: string };
const cursor = (res: Response) => res.locals.valid.query?.cursor as string | undefined;

export function socialController(social: SocialService) {
  const likeEvent =
    (liked: boolean): RequestHandler =>
    async (_req, res) => {
      res.json(await social.likeEvent(actor(res), params(res).id, liked));
    };

  const listComments: RequestHandler = async (_req, res) => {
    res.json(await social.listComments(params(res).id, cursor(res), res.locals.user?.id));
  };
  const addComment: RequestHandler = async (_req, res) => {
    res.status(201).json({
      comment: await social.addComment(actor(res), params(res).id, res.locals.valid.body),
    });
  };
  const editComment: RequestHandler = async (_req, res) => {
    await social.editComment(actor(res), params(res).id, res.locals.valid.body.body);
    res.status(204).end();
  };
  const deleteComment: RequestHandler = async (_req, res) => {
    await social.deleteComment(actor(res), params(res).id);
    res.status(204).end();
  };
  const react =
    (on: boolean): RequestHandler =>
    async (_req, res) => {
      const { id, kind } = res.locals.valid.params;
      res.json({ reactions: await social.react(actor(res), id, kind, on) });
    };

  const listPhotos: RequestHandler = async (_req, res) => {
    res.json(await social.listPhotos(params(res).id, cursor(res), viewer(res)));
  };
  const addPhoto: RequestHandler = async (req, res) => {
    const photo = await social.addPhoto(
      actor(res),
      params(res).id,
      req.file!.buffer,
      res.locals.valid.body.caption,
    );
    res.status(201).json({ id: photo.id });
  };
  const deletePhoto: RequestHandler = async (_req, res) => {
    await social.deletePhoto(actor(res), params(res).id);
    res.status(204).end();
  };
  const likePhoto =
    (liked: boolean): RequestHandler =>
    async (_req, res) => {
      res.json(await social.likePhoto(actor(res), params(res).id, liked));
    };

  return {
    likeEvent,
    listComments,
    addComment,
    editComment,
    deleteComment,
    react,
    listPhotos,
    addPhoto,
    deletePhoto,
    likePhoto,
  };
}
