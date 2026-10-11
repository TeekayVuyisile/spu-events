import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'mth.sid';

/** Logs the user in on a fresh session id, which prevents session fixation. */
export async function startSession(req: Request, userId: string) {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.userId = userId;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
}

export async function endSession(req: Request, res: Response) {
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
