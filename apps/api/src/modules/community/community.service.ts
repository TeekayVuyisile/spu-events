import type {
  ModerationActionInput,
  ModerationItem,
  ReportInput,
  ReportTarget,
  VolunteerApplicant,
  VolunteerApplication,
  VolunteerApplyInput,
  VolunteerStatus,
} from '@monthati/shared';
import type { Db } from '../../db/client';
import type { NewNotification } from '../../db/schema';
import { uniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import type { StorageService } from '../../lib/storage';
import { eventsRepository } from '../events/events.repository';
import { notify } from '../notifications/notifications.repository';
import { socialRepository } from '../social/social.repository';
import type { Actor } from '../social/social.service';
import { communityRepository } from './community.repository';

type ApplicationRow = Awaited<
  ReturnType<ReturnType<typeof communityRepository>['insertApplication']>
>;

const toApplication = (a: ApplicationRow): VolunteerApplication => ({
  id: a.id,
  role: a.role,
  motivation: a.motivation,
  status: a.status,
  createdAt: a.createdAt.toISOString(),
  decidedAt: a.decidedAt?.toISOString() ?? null,
});

const shortName = (first: string | null, last: string | null) =>
  first ? `${first} ${last?.[0] ?? ''}.`.replace(/ \.$/, '') : 'Someone';

export function communityService({ db, storage }: { db: Db; storage: StorageService }) {
  const repo = communityRepository(db);
  const events = eventsRepository(db);
  const social = socialRepository(db);

  async function eventOrThrow(eventId: string) {
    const event = await events.findById(eventId);
    if (!event || event.status === 'draft') throw AppError.notFound('Event not found');
    return event;
  }

  /** Notifications for volunteer decisions, built from the rows that actually changed. */
  function decisionNotices(rows: ApplicationRow[], event: { title: string; slug: string }) {
    return rows.map((a): NewNotification =>
      a.status === 'accepted'
        ? {
            userId: a.userId,
            kind: 'volunteer_accepted',
            title: `You’re volunteering at ${event.title}`,
            body: `Your application as ${a.role} was accepted. The organisers will be in touch with details.`,
            link: `/events/${event.slug}`,
          }
        : {
            userId: a.userId,
            kind: 'volunteer_declined',
            title: `Volunteer update for ${event.title}`,
            body: `Thanks for offering to help as ${a.role}. The organisers have all the volunteers they need this time.`,
            link: `/events/${event.slug}`,
          },
    );
  }

  return {
    // ── Volunteers ──

    async apply(userId: string, eventId: string, input: VolunteerApplyInput) {
      const event = await eventOrThrow(eventId);
      if (event.status !== 'published' || !event.volunteersWanted || event.endsAt <= new Date()) {
        throw AppError.conflict('This event isn’t looking for volunteers');
      }
      try {
        return toApplication(await repo.insertApplication({ eventId, userId, ...input }));
      } catch (err) {
        if (uniqueViolation(err) !== null)
          throw AppError.conflict('You’ve already applied to volunteer');
        throw err;
      }
    },

    async mine(userId: string, eventId: string) {
      await eventOrThrow(eventId);
      const row = await repo.latestApplication(eventId, userId);
      return row ? toApplication(row) : null;
    },

    async withdraw(userId: string, eventId: string) {
      const row = await repo.withdraw(eventId, userId);
      if (!row) throw AppError.conflict('Only a pending application can be withdrawn');
      return toApplication(row);
    },

    async applicants(eventId: string, status?: VolunteerStatus): Promise<VolunteerApplicant[]> {
      if (!(await events.findById(eventId))) throw AppError.notFound('Event not found');
      return (await repo.applicants(eventId, status)).map((r) => ({
        ...toApplication(r.app),
        student: {
          id: r.app.userId,
          name: `${r.firstName} ${r.lastName}`,
          email: r.email,
          studentNumber: r.studentNumber,
        },
      }));
    },

    /** Decide one application, notifying the student in the same transaction. */
    async decide(adminId: string, applicationId: string, decision: 'accept' | 'decline') {
      return db.transaction(async (tx) => {
        const [row] = await communityRepository(tx).decide(
          { id: applicationId },
          decision === 'accept' ? 'accepted' : 'declined',
          adminId,
        );
        if (!row) throw AppError.conflict('That application has already been decided or withdrawn');
        const event = (await eventsRepository(tx).findById(row.eventId))!;
        await notify(tx, decisionNotices([row], event));
        return toApplication(row);
      });
    },

    /** The old app's "accept all / decline all", now atomic. */
    async decideAll(adminId: string, eventId: string, decision: 'accept' | 'decline') {
      return db.transaction(async (tx) => {
        const event = await eventsRepository(tx).findById(eventId);
        if (!event) throw AppError.notFound('Event not found');
        const rows = await communityRepository(tx).decide(
          { eventId },
          decision === 'accept' ? 'accepted' : 'declined',
          adminId,
        );
        await notify(tx, decisionNotices(rows, event));
        return { decided: rows.length };
      });
    },

    // ── Reports ──

    /** Reporting the same thing twice is harmless: the open report already counts. */
    async report(actor: Actor, input: ReportInput) {
      const target =
        input.targetType === 'comment'
          ? await social.findComment(input.targetId)
          : await social.findPhoto(input.targetId);
      if (!target || ('deletedAt' in target && target.deletedAt)) {
        throw AppError.notFound('That post no longer exists');
      }
      if (target.userId === actor.id) throw AppError.badRequest('You can’t report your own post');

      try {
        await repo.insertReport({
          reporterId: actor.id,
          targetType: input.targetType,
          targetId: input.targetId,
          targetUserId: target.userId,
          eventId: target.eventId,
          reason: input.reason,
          details: input.details,
        });
      } catch (err) {
        if (uniqueViolation(err) === null) throw err;
      }
      return { reported: true };
    },

    // ── Moderation ──

    openCount: () => repo.countOpenTargets(),

    /** Open reports grouped per reported item, oldest first. */
    async queue(): Promise<ModerationItem[]> {
      const rows = await repo.openReports();
      const key = (t: ReportTarget, id: string) => `${t}:${id}`;
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = key(r.report.targetType, r.report.targetId);
        groups.set(k, [...(groups.get(k) ?? []), r]);
      }

      const commentIds = rows
        .filter((r) => r.report.targetType === 'comment')
        .map((r) => r.report.targetId);
      const photoIds = rows
        .filter((r) => r.report.targetType === 'photo')
        .map((r) => r.report.targetId);
      const [commentRows, photoRows] = await Promise.all([
        repo.commentsByIds([...new Set(commentIds)]),
        repo.photosByIds([...new Set(photoIds)]),
      ]);
      const authorIds = [
        ...new Set(rows.map((r) => r.report.targetUserId).filter(Boolean)),
      ] as string[];
      const authors = new Map((await repo.usersByIds(authorIds)).map((u) => [u.id, u]));
      const commentsById = new Map(commentRows.map((c) => [c.id, c]));
      const photosById = new Map(photoRows.map((p) => [p.id, p]));

      return [...groups.values()].map((group): ModerationItem => {
        const first = group[0]!;
        const { targetType, targetId, targetUserId } = first.report;
        const comment = targetType === 'comment' ? commentsById.get(targetId) : undefined;
        const photo = targetType === 'photo' ? photosById.get(targetId) : undefined;
        const author = targetUserId ? authors.get(targetUserId) : undefined;
        return {
          targetType,
          targetId,
          text: comment ? (comment.deletedAt ? null : comment.body) : (photo?.caption ?? null),
          photoUrl: photo ? storage.url(photo.storageKey) : null,
          author: author
            ? {
                id: author.id,
                name: `${author.firstName} ${author.lastName}`,
                avatarUrl: author.avatarUrl,
                email: author.email,
                status: author.status,
              }
            : null,
          event: { id: first.report.eventId, title: first.eventTitle, slug: first.eventSlug },
          reports: group.map((r) => ({
            id: r.report.id,
            reason: r.report.reason,
            details: r.report.details,
            reporterName: shortName(r.reporterFirstName, r.reporterLastName),
            createdAt: r.report.createdAt.toISOString(),
          })),
          firstReportedAt: first.report.createdAt.toISOString(),
        };
      });
    },

    /**
     * Resolves every open report on one item in a single transaction: removes the
     * content if asked, warns or suspends the author, and tells everyone involved.
     */
    async act(
      adminId: string,
      targetType: ReportTarget,
      targetId: string,
      input: ModerationActionInput,
    ) {
      let removedPhotoKey: string | null = null;

      await db.transaction(async (tx) => {
        const community = communityRepository(tx);
        const resolved = await community.resolveTarget(
          targetType,
          targetId,
          { status: input.action === 'dismiss' ? 'dismissed' : 'resolved', action: input.action },
          adminId,
        );
        if (!resolved.length) throw AppError.notFound('No open reports for that post');

        const { targetUserId, eventId } = resolved[0]!;
        const event = (await eventsRepository(tx).findById(eventId))!;
        const what = targetType === 'comment' ? 'comment' : 'photo';
        const notices: NewNotification[] = [];

        if (input.action !== 'dismiss') {
          if (targetType === 'comment') {
            await socialRepository(tx).deleteComment(targetId, adminId);
          } else {
            const photo = await socialRepository(tx).deletePhoto(targetId);
            removedPhotoKey = photo?.storageKey ?? null;
          }

          if (targetUserId) {
            const note = input.note ? ` Note from the moderators: ${input.note}` : '';
            notices.push({
              userId: targetUserId,
              kind: 'content_removed',
              title: `Your ${what} was removed`,
              body: `A ${what} you posted on ${event.title} broke the community guidelines and was removed.${note}`,
              link: `/events/${event.slug}`,
            });
            if (input.action === 'remove_and_warn') {
              notices.push({
                userId: targetUserId,
                kind: 'account_warning',
                title: 'Warning about your account',
                body: 'Please keep posts respectful. Further breaks of the guidelines may suspend your account.',
                link: null,
              });
            }
            if (input.action === 'remove_and_suspend') {
              await community.suspendUser(targetUserId);
              notices.push({
                userId: targetUserId,
                kind: 'account_warning',
                title: 'Your account is suspended',
                body: 'Contact the events office to discuss reinstating your account.',
                link: null,
              });
            }
          }
        }

        // Each reporter hears back once, however many reports they filed.
        const reporters = [
          ...new Set(resolved.map((r) => r.reporterId).filter(Boolean)),
        ] as string[];
        for (const reporterId of reporters) {
          notices.push({
            userId: reporterId,
            kind: 'report_resolved',
            title:
              input.action === 'dismiss' ? 'We reviewed your report' : 'Thanks for your report',
            body:
              input.action === 'dismiss'
                ? `We looked at the ${what} you reported on ${event.title} and it doesn’t break the guidelines.`
                : `We removed the ${what} you reported on ${event.title}.`,
            link: `/events/${event.slug}`,
          });
        }
        await notify(tx, notices);
      });

      // Delete the file only once the database change has committed.
      if (removedPhotoKey) await storage.delete(removedPhotoKey);
      return { ok: true };
    },
  };
}

export type CommunityService = ReturnType<typeof communityService>;
