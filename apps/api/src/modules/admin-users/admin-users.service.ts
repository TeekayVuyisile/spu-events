import {
  ADMIN_USER_PAGE_SIZE,
  formatCents,
  type AdminUserDetail,
  type AdminUserListQuery,
  type AdminUserPage,
  type AdminUserSummary,
  type ReinstateUserInput,
  type SuspendUserInput,
  type WalletAdjustmentInput,
} from '@spu-events/shared';
import type { Db } from '../../db/client';
import type { User } from '../../db/schema';
import { uniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { audit, auditRepository } from '../audit/audit.repository';
import { notify } from '../notifications/notifications.repository';
import { usersRepository } from '../users/users.repository';
import { walletRepository } from '../wallet/wallet.repository';
import { toLedgerEntries } from '../wallet/wallet.service';
import { adminUsersRepository } from './admin-users.repository';

const notFound = () => AppError.notFound('User not found');

const summary = (u: Omit<User, 'passwordHash' | 'avatarUrl' | 'updatedAt'>): AdminUserSummary => ({
  id: u.id,
  role: u.role,
  status: u.status,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  studentNumber: u.studentNumber,
  createdAt: u.createdAt.toISOString(),
});

export function adminUsersService({ db }: { db: Db }) {
  const repo = adminUsersRepository(db);
  const usersRepo = usersRepository(db);

  async function load(id: string) {
    const user = await usersRepo.findById(id);
    if (!user) throw notFound();
    return user;
  }

  async function get(id: string): Promise<AdminUserDetail> {
    const user = await load(id);
    const isStudent = user.role === 'student';
    const wallet = walletRepository(db);
    const [stats, tickets, history, balanceCents, ledger] = await Promise.all([
      repo.stats(id),
      repo.tickets(id),
      auditRepository(db).forUser(id),
      isStudent ? wallet.balance(id) : null,
      isStudent ? wallet.history(id, 20) : [],
    ]);
    return {
      ...summary(user),
      balanceCents,
      stats,
      tickets: tickets.map((t) => ({
        id: t.id,
        code: t.code,
        status: t.status,
        pricePaidCents: t.pricePaidCents,
        createdAt: t.createdAt.toISOString(),
        event: { id: t.eventId, title: t.eventTitle, startsAt: t.eventStartsAt.toISOString() },
      })),
      ledger: toLedgerEntries(ledger),
      history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    };
  }

  /** Admin accounts can't be suspended from here, so admins can't lock each other out. */
  function assertSuspendable(adminId: string, user: User) {
    if (user.id === adminId) throw AppError.forbidden('You can’t suspend your own account');
    if (user.role === 'admin') throw AppError.forbidden('Admin accounts can’t be suspended');
  }

  return {
    get,

    async list(query: AdminUserListQuery): Promise<AdminUserPage> {
      const rows = await repo.list(query);
      const total = rows[0]?.total ?? 0;
      return {
        users: rows.map(summary),
        total,
        nextPage: query.page * ADMIN_USER_PAGE_SIZE < total ? query.page + 1 : null,
      };
    },

    async suspend(adminId: string, id: string, { reason }: SuspendUserInput) {
      assertSuspendable(adminId, await load(id));
      await db.transaction(async (tx) => {
        if (!(await adminUsersRepository(tx).setStatus(id, 'active', 'suspended'))) {
          throw AppError.conflict('This account is already suspended');
        }
        await audit(tx, { actorId: adminId, action: 'user_suspended', targetUserId: id, reason });
        // Read when (if) they're reinstated: suspended users can't sign in.
        await notify(tx, [
          {
            userId: id,
            kind: 'account_warning',
            title: 'Your account was suspended',
            body: `Reason: ${reason}`,
            link: null,
          },
        ]);
      });
      return get(id);
    },

    async reinstate(adminId: string, id: string, { reason }: ReinstateUserInput) {
      await load(id);
      await db.transaction(async (tx) => {
        if (!(await adminUsersRepository(tx).setStatus(id, 'suspended', 'active'))) {
          throw AppError.conflict('This account isn’t suspended');
        }
        await audit(tx, { actorId: adminId, action: 'user_reinstated', targetUserId: id, reason });
        await notify(tx, [
          {
            userId: id,
            kind: 'account_reinstated',
            title: 'Welcome back: your account is active again',
            body: reason,
            link: null,
          },
        ]);
      });
      return get(id);
    },

    /**
     * A logged manual credit or debit. Debits take the user lock and can't push the
     * balance below zero. The ledger's (user, requestId) index makes retries no-ops.
     */
    async adjustWallet(adminId: string, id: string, input: WalletAdjustmentInput) {
      const user = await load(id);
      if (user.role !== 'student') throw AppError.badRequest('Only students have wallets');
      if (await walletRepository(db).findByRequest(id, input.requestId)) return get(id);

      const amountCents = input.direction === 'credit' ? input.amountCents : -input.amountCents;
      try {
        await db.transaction(async (tx) => {
          const wallet = walletRepository(tx);
          if (amountCents < 0) {
            await wallet.lockUser(id);
            const balance = await wallet.balance(id);
            if (balance < input.amountCents) {
              throw new AppError(
                409,
                'INSUFFICIENT_FUNDS',
                `The balance is ${formatCents(balance)}, so at most that can be taken`,
                { amountCents: ['More than the current balance'] },
              );
            }
          }
          await wallet.insert({
            userId: id,
            amountCents,
            kind: 'adjustment',
            note: input.reason,
            requestId: input.requestId,
          });
          await audit(tx, {
            actorId: adminId,
            action: 'wallet_adjusted',
            targetUserId: id,
            reason: input.reason,
            amountCents,
          });
          await notify(tx, [
            {
              userId: id,
              kind: 'wallet_adjusted',
              title:
                amountCents > 0
                  ? `${formatCents(amountCents)} added to your wallet`
                  : `${formatCents(-amountCents)} taken from your wallet`,
              body: input.reason,
              link: '/wallet',
            },
          ]);
        });
      } catch (err) {
        // A concurrent duplicate of the same request got there first.
        if (uniqueViolation(err) === null) throw err;
      }
      return get(id);
    },
  };
}

export type AdminUsersService = ReturnType<typeof adminUsersService>;
