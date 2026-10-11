import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { notifications, type NewNotification } from '../../db/schema';

/**
 * Inserts notifications on the given executor. Pass the caller's transaction so
 * a notification exists only if the thing it announces actually happened.
 */
export async function notify(db: Executor, rows: NewNotification[]) {
  if (rows.length) await db.insert(notifications).values(rows);
}

export function notificationsRepository(db: Executor) {
  return {
    async list(userId: string, cursor: { ts: string; id: string } | null, limit: number) {
      const where: SQL[] = [eq(notifications.userId, userId)];
      if (cursor) {
        where.push(
          sql`(${notifications.createdAt}, ${notifications.id}) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
        );
      }
      return db
        .select({ row: notifications, cursorTs: sql<string>`${notifications.createdAt}::text` })
        .from(notifications)
        .where(and(...where))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit + 1);
    },

    async unreadCount(userId: string) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
      return row!.n;
    },

    /** Marks the given notifications (or all, if no ids) as read. Only the user's own. */
    async markRead(userId: string, ids?: string[]) {
      await db
        .update(notifications)
        .set({ readAt: sql`now()` })
        .where(
          and(
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
            ids ? inArray(notifications.id, ids) : undefined,
          ),
        );
    },
  };
}
