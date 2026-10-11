import { and, desc, eq, getTableColumns, gt, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../db/client';
import { invites, users } from '../../db/schema';

/** Still usable: not accepted, not revoked, not expired. */
const usable = and(
  isNull(invites.acceptedAt),
  isNull(invites.revokedAt),
  gt(invites.expiresAt, sql`now()`),
);
const pending = and(isNull(invites.acceptedAt), isNull(invites.revokedAt));

export function invitesRepository(db: Executor) {
  return {
    /** Most recent first, with the inviting admin's name. */
    async list(limit = 100) {
      const inviter = alias(users, 'inviter');
      return db
        .select({
          ...getTableColumns(invites),
          inviterFirstName: inviter.firstName,
          inviterLastName: inviter.lastName,
        })
        .from(invites)
        .leftJoin(inviter, eq(inviter.id, invites.invitedById))
        .orderBy(desc(invites.createdAt))
        .limit(limit);
    },

    async insert(values: typeof invites.$inferInsert) {
      const [row] = await db.insert(invites).values(values).returning();
      return row!;
    },

    /** Re-inviting an email retires its older links, so only the newest one works. */
    async revokePendingForEmail(email: string) {
      await db
        .update(invites)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(invites.email, email), pending));
    },

    async revoke(id: string) {
      const [row] = await db
        .update(invites)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(invites.id, id), pending))
        .returning();
      return row;
    },

    async findUsableByTokenHash(tokenHash: string) {
      const [row] = await db
        .select()
        .from(invites)
        .where(and(eq(invites.tokenHash, tokenHash), usable));
      return row;
    },

    /**
     * Marks the invite accepted in one conditional UPDATE, so two simultaneous
     * accepts can't both succeed. Returns undefined if it's no longer usable.
     */
    async claim(tokenHash: string) {
      const [row] = await db
        .update(invites)
        .set({ acceptedAt: sql`now()` })
        .where(and(eq(invites.tokenHash, tokenHash), usable))
        .returning();
      return row;
    },

    async setAcceptedUser(id: string, userId: string) {
      await db.update(invites).set({ acceptedUserId: userId }).where(eq(invites.id, id));
    },
  };
}

export type InvitesRepository = ReturnType<typeof invitesRepository>;
