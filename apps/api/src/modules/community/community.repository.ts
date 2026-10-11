import type { ReportTarget, VolunteerStatus } from '@spu-events/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../db/client';
import { comments, events, photos, reports, users, volunteerApplications } from '../../db/schema';

export function communityRepository(db: Executor) {
  return {
    // ── Volunteers ──

    async insertApplication(values: typeof volunteerApplications.$inferInsert) {
      const [row] = await db.insert(volunteerApplications).values(values).returning();
      return row!;
    },

    /** The student's most recent application for the event, whatever its status. */
    async latestApplication(eventId: string, userId: string) {
      const [row] = await db
        .select()
        .from(volunteerApplications)
        .where(
          and(eq(volunteerApplications.eventId, eventId), eq(volunteerApplications.userId, userId)),
        )
        .orderBy(desc(volunteerApplications.createdAt))
        .limit(1);
      return row;
    },

    async withdraw(eventId: string, userId: string) {
      const [row] = await db
        .update(volunteerApplications)
        .set({ status: 'withdrawn' })
        .where(
          and(
            eq(volunteerApplications.eventId, eventId),
            eq(volunteerApplications.userId, userId),
            eq(volunteerApplications.status, 'pending'),
          ),
        )
        .returning();
      return row;
    },

    async applicants(eventId: string, status?: VolunteerStatus) {
      return db
        .select({
          app: volunteerApplications,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          studentNumber: users.studentNumber,
        })
        .from(volunteerApplications)
        .innerJoin(users, eq(users.id, volunteerApplications.userId))
        .where(
          and(
            eq(volunteerApplications.eventId, eventId),
            status ? eq(volunteerApplications.status, status) : undefined,
          ),
        )
        .orderBy(asc(volunteerApplications.createdAt));
    },

    /**
     * pending → accepted/declined in one conditional UPDATE, for one application
     * (`id`) or every pending one at an event (`eventId`). Returns what changed.
     */
    async decide(
      where: { id: string } | { eventId: string },
      status: 'accepted' | 'declined',
      adminId: string,
    ) {
      return db
        .update(volunteerApplications)
        .set({ status, decidedById: adminId, decidedAt: sql`now()` })
        .where(
          and(
            'id' in where
              ? eq(volunteerApplications.id, where.id)
              : eq(volunteerApplications.eventId, where.eventId),
            eq(volunteerApplications.status, 'pending'),
          ),
        )
        .returning();
    },

    // ── Reports ──

    async insertReport(values: typeof reports.$inferInsert) {
      const [row] = await db.insert(reports).values(values).returning();
      return row!;
    },

    async openReports() {
      const reporter = alias(users, 'reporter');
      return db
        .select({
          report: reports,
          reporterFirstName: reporter.firstName,
          reporterLastName: reporter.lastName,
          eventTitle: events.title,
          eventSlug: events.slug,
        })
        .from(reports)
        .leftJoin(reporter, eq(reporter.id, reports.reporterId))
        .innerJoin(events, eq(events.id, reports.eventId))
        .where(eq(reports.status, 'open'))
        .orderBy(asc(reports.createdAt))
        .limit(500);
    },

    async countOpenTargets() {
      const [row] = await db
        .select({
          n: sql<number>`count(distinct (${reports.targetType}, ${reports.targetId}))::int`,
        })
        .from(reports)
        .where(eq(reports.status, 'open'));
      return row!.n;
    },

    /** Closes every open report on a target at once and returns them. */
    async resolveTarget(
      targetType: ReportTarget,
      targetId: string,
      outcome: {
        status: 'resolved' | 'dismissed';
        action: (typeof reports.$inferInsert)['action'];
      },
      adminId: string,
    ) {
      return db
        .update(reports)
        .set({ ...outcome, resolvedById: adminId, resolvedAt: sql`now()` })
        .where(
          and(
            eq(reports.targetType, targetType),
            eq(reports.targetId, targetId),
            eq(reports.status, 'open'),
          ),
        )
        .returning();
    },

    async commentsByIds(ids: string[]) {
      if (!ids.length) return [];
      return db.select().from(comments).where(inArray(comments.id, ids));
    },
    async photosByIds(ids: string[]) {
      if (!ids.length) return [];
      return db.select().from(photos).where(inArray(photos.id, ids));
    },
    async usersByIds(ids: string[]) {
      if (!ids.length) return [];
      return db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatarUrl: users.avatarUrl,
          status: users.status,
        })
        .from(users)
        .where(inArray(users.id, ids));
    },

    async suspendUser(userId: string) {
      await db.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
    },
  };
}
