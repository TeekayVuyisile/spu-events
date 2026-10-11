import { desc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { auditLog, users, type NewAuditRow } from '../../db/schema';

/** Records an admin action. Pass the caller's transaction so the record and the change commit together. */
export async function audit(db: Executor, row: NewAuditRow) {
  await db.insert(auditLog).values(row);
}

export function auditRepository(db: Executor) {
  return {
    /** Newest first, with the acting admin's name. */
    async forUser(userId: string, limit = 50) {
      return db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          reason: auditLog.reason,
          amountCents: auditLog.amountCents,
          createdAt: auditLog.createdAt,
          actorName: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}`,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(eq(auditLog.targetUserId, userId))
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit);
    },
  };
}
