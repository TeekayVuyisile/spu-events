import {
  moderationActionSchema,
  REPORT_TARGETS,
  reportSchema,
  VOLUNTEER_STATUSES,
  volunteerApplySchema,
  volunteerDecisionSchema,
} from '@monthati/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import { userRateLimit } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import { communityController } from './community.controller';
import type { CommunityService } from './community.service';

const idParams = z.object({ id: z.uuid('Invalid id') });
const targetParams = z.object({ targetType: z.enum(REPORT_TARGETS), targetId: z.uuid() });
const statusQuery = z.object({ status: z.enum(VOLUNTEER_STATUSES).optional().catch(undefined) });

/** Mounted at /api: volunteering (students) and reporting (anyone signed in). */
export function communityRoutes(
  community: CommunityService,
  { limitsEnabled }: { limitsEnabled: boolean },
) {
  const c = communityController(community);
  const router = Router();
  const byId = validate('params', idParams);
  const student = requireRole('student');
  const reportLimit = userRateLimit({
    enabled: limitsEnabled,
    windowMs: 60 * 60 * 1000,
    limit: 30,
  });

  router.get('/events/:id/volunteer', student, byId, c.myApplication);
  router.post(
    '/events/:id/volunteer',
    student,
    byId,
    validate('body', volunteerApplySchema),
    c.apply,
  );
  router.delete('/events/:id/volunteer', student, byId, c.withdraw);

  router.post('/reports', requireAuth, reportLimit, validate('body', reportSchema), c.report);
  return router;
}

/** Mounted at /api/admin: volunteer decisions and the moderation queue. */
export function adminCommunityRoutes(community: CommunityService) {
  const c = communityController(community);
  const router = Router();
  const byId = validate('params', idParams);
  const decision = validate('body', volunteerDecisionSchema);

  router.use(requireRole('admin'));
  router.get('/events/:id/volunteers', byId, validate('query', statusQuery), c.applicants);
  router.post('/events/:id/volunteers/decide-all', byId, decision, c.decideAll);
  router.post('/volunteers/:id/decision', byId, decision, c.decide);

  router.get('/moderation', c.queue);
  router.get('/moderation/count', c.openCount);
  router.post(
    '/moderation/:targetType/:targetId',
    validate('params', targetParams),
    validate('body', moderationActionSchema),
    c.act,
  );
  return router;
}
