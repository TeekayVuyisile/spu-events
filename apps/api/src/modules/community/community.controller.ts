import type { RequestHandler, Response } from 'express';
import type { CommunityService } from './community.service';

const user = (res: Response) => res.locals.user!;
const p = (res: Response) => res.locals.valid.params as Record<string, string>;

export function communityController(community: CommunityService) {
  // ── Volunteers (students) ──
  const myApplication: RequestHandler = async (_req, res) => {
    res.json({ application: await community.mine(user(res).id, p(res).id!) });
  };
  const apply: RequestHandler = async (_req, res) => {
    res.status(201).json({
      application: await community.apply(user(res).id, p(res).id!, res.locals.valid.body),
    });
  };
  const withdraw: RequestHandler = async (_req, res) => {
    res.json({ application: await community.withdraw(user(res).id, p(res).id!) });
  };

  // ── Volunteers (admins) ──
  const applicants: RequestHandler = async (_req, res) => {
    res.json({ applicants: await community.applicants(p(res).id!, res.locals.valid.query.status) });
  };
  const decide: RequestHandler = async (_req, res) => {
    res.json({
      application: await community.decide(user(res).id, p(res).id!, res.locals.valid.body.decision),
    });
  };
  const decideAll: RequestHandler = async (_req, res) => {
    res.json(await community.decideAll(user(res).id, p(res).id!, res.locals.valid.body.decision));
  };

  // ── Reports and moderation ──
  const report: RequestHandler = async (_req, res) => {
    res.status(201).json(await community.report(user(res), res.locals.valid.body));
  };
  const queue: RequestHandler = async (_req, res) => {
    res.json({ items: await community.queue() });
  };
  const openCount: RequestHandler = async (_req, res) => {
    res.json({ count: await community.openCount() });
  };
  const act: RequestHandler = async (_req, res) => {
    const { targetType, targetId } = res.locals.valid.params;
    res.json(await community.act(user(res).id, targetType, targetId, res.locals.valid.body));
  };

  return {
    myApplication,
    apply,
    withdraw,
    applicants,
    decide,
    decideAll,
    report,
    queue,
    openCount,
    act,
  };
}
