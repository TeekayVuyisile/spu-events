import { and, desc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { events, tickets, users, walletLedger } from '../../db/schema';

export function walletRepository(db: Executor) {
  return {
    /**
     * Locks the user's row until the transaction ends. Every debit takes this
     * lock before reading the balance, so two spends can't both see the same rands.
     */
    async lockUser(userId: string) {
      await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    },

    async balance(userId: string) {
      const [row] = await db
        .select({ cents: sql<number>`coalesce(sum(${walletLedger.amountCents}), 0)::int` })
        .from(walletLedger)
        .where(eq(walletLedger.userId, userId));
      return row!.cents;
    },

    async insert(values: typeof walletLedger.$inferInsert) {
      const [row] = await db.insert(walletLedger).values(values).returning();
      return row!;
    },

    async findByRequest(userId: string, requestId: string) {
      const [row] = await db
        .select()
        .from(walletLedger)
        .where(and(eq(walletLedger.userId, userId), eq(walletLedger.requestId, requestId)));
      return row;
    },

    /** Newest first, each with the running balance straight after it and the event title if any. */
    async history(userId: string, limit = 50) {
      return db
        .select({
          id: walletLedger.id,
          amountCents: walletLedger.amountCents,
          kind: walletLedger.kind,
          note: walletLedger.note,
          createdAt: walletLedger.createdAt,
          eventTitle: events.title,
          // The window runs over all of the user's rows before LIMIT applies.
          balanceAfterCents: sql<number>`(sum(${walletLedger.amountCents}) over (order by ${walletLedger.createdAt}, ${walletLedger.id}))::int`,
        })
        .from(walletLedger)
        .leftJoin(tickets, eq(tickets.id, walletLedger.ticketId))
        .leftJoin(events, eq(events.id, tickets.eventId))
        .where(eq(walletLedger.userId, userId))
        .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
        .limit(limit);
    },
  };
}

export type WalletRepository = ReturnType<typeof walletRepository>;
