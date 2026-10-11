import type { MeResponse } from '@spu-events/shared';
import type { RequestHandler } from 'express';
import { startSession } from '../../lib/session';
import type { InvitesService } from './invites.service';

export function invitesController(invites: InvitesService) {
  const list: RequestHandler = async (_req, res) => {
    res.json({ invites: await invites.list() });
  };

  const create: RequestHandler = async (_req, res) => {
    res.status(201).json(await invites.create(res.locals.valid.body, res.locals.user!));
  };

  const revoke: RequestHandler = async (_req, res) => {
    res.json({ invite: await invites.revoke(res.locals.valid.params.id) });
  };

  const preview: RequestHandler = async (_req, res) => {
    res.json({ invite: await invites.preview(res.locals.valid.params.token) });
  };

  /** Creates the account and signs the new staff member or admin straight in. */
  const accept: RequestHandler = async (req, res) => {
    const user = await invites.accept(
      res.locals.valid.params.token,
      res.locals.valid.body.password,
    );
    await startSession(req, user.id);
    res.status(201).json({ user } satisfies MeResponse);
  };

  return { list, create, revoke, preview, accept };
}
