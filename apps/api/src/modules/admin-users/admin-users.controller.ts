import type { RequestHandler, Response } from 'express';
import type { AdminUsersService } from './admin-users.service';

const adminId = (res: Response) => res.locals.user!.id;
const id = (res: Response) => res.locals.valid.params.id as string;

export function adminUsersController(users: AdminUsersService) {
  const list: RequestHandler = async (_req, res) => {
    res.json(await users.list(res.locals.valid.query));
  };
  const get: RequestHandler = async (_req, res) => {
    res.json({ user: await users.get(id(res)) });
  };
  const suspend: RequestHandler = async (_req, res) => {
    res.json({ user: await users.suspend(adminId(res), id(res), res.locals.valid.body) });
  };
  const reinstate: RequestHandler = async (_req, res) => {
    res.json({ user: await users.reinstate(adminId(res), id(res), res.locals.valid.body) });
  };
  const adjustWallet: RequestHandler = async (_req, res) => {
    res.json({ user: await users.adjustWallet(adminId(res), id(res), res.locals.valid.body) });
  };
  return { list, get, suspend, reinstate, adjustWallet };
}
