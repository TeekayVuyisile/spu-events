import {
  commentEditSchema,
  commentInputSchema,
  photoCaptionSchema,
  reactionKindSchema,
} from '@monthati/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { userRateLimit } from '../../middleware/rate-limit';
import { singleImage } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import { socialController } from './social.controller';
import type { SocialService } from './social.service';

const idParams = z.object({ id: z.uuid('Invalid id') });
const reactionParams = idParams.extend({ kind: reactionKindSchema });
const pageQuery = z.object({ cursor: z.string().max(200).optional() });

const MINUTE = 60 * 1000;

/** Mounted at /api. Reading is public; everything else needs a signed-in user. */
export function socialRoutes(social: SocialService, { limitsEnabled }: { limitsEnabled: boolean }) {
  const c = socialController(social);
  const router = Router();
  const byId = validate('params', idParams);
  const commentLimit = userRateLimit({ enabled: limitsEnabled, windowMs: 10 * MINUTE, limit: 20 });
  const photoLimit = userRateLimit({ enabled: limitsEnabled, windowMs: 60 * MINUTE, limit: 15 });

  router.put('/events/:id/like', requireAuth, byId, c.likeEvent(true));
  router.delete('/events/:id/like', requireAuth, byId, c.likeEvent(false));

  router.get('/events/:id/comments', byId, validate('query', pageQuery), c.listComments);
  router.post(
    '/events/:id/comments',
    requireAuth,
    commentLimit,
    byId,
    validate('body', commentInputSchema),
    c.addComment,
  );
  router.patch(
    '/comments/:id',
    requireAuth,
    byId,
    validate('body', commentEditSchema),
    c.editComment,
  );
  router.delete('/comments/:id', requireAuth, byId, c.deleteComment);
  router.put(
    '/comments/:id/reactions/:kind',
    requireAuth,
    validate('params', reactionParams),
    c.react(true),
  );
  router.delete(
    '/comments/:id/reactions/:kind',
    requireAuth,
    validate('params', reactionParams),
    c.react(false),
  );

  router.get('/events/:id/photos', byId, validate('query', pageQuery), c.listPhotos);
  router.post(
    '/events/:id/photos',
    requireAuth,
    photoLimit,
    byId,
    singleImage('photo', { textFields: 1 }),
    validate('body', photoCaptionSchema),
    c.addPhoto,
  );
  router.delete('/photos/:id', requireAuth, byId, c.deletePhoto);
  router.put('/photos/:id/like', requireAuth, byId, c.likePhoto(true));
  router.delete('/photos/:id/like', requireAuth, byId, c.likePhoto(false));

  return router;
}
