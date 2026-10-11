import type {
  CreateInviteInput,
  CreatedInvite,
  InvitableRole,
  Invite,
  InvitePreview,
  InviteStatus,
} from '@monthati/shared';
import type { Db } from '../../db/client';
import type { InviteRow } from '../../db/schema';
import { uniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { generateToken, hashToken } from '../../lib/tokens';
import { duplicateUserError } from '../auth/auth.service';
import { toSessionUser, usersRepository } from '../users/users.repository';
import { invitesRepository } from './invites.repository';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const invalidInvite = () =>
  new AppError(404, 'INVITE_INVALID', 'This invite link is invalid, already used or expired');

function statusOf(row: InviteRow, now = new Date()): InviteStatus {
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  return row.expiresAt <= now ? 'expired' : 'pending';
}

function toInvite(
  row: InviteRow & { inviterFirstName?: string | null; inviterLastName?: string | null },
): Invite {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    // The DB check constraint guarantees invites never carry the student role.
    role: row.role as InvitableRole,
    status: statusOf(row),
    invitedBy: row.inviterFirstName ? `${row.inviterFirstName} ${row.inviterLastName}` : null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function invitesService({ db, webOrigin }: { db: Db; webOrigin: string }) {
  const invites = invitesRepository(db);
  const users = usersRepository(db);

  return {
    async create(
      input: CreateInviteInput,
      admin: { id: string; firstName: string; lastName: string },
    ) {
      if (await users.findByEmail(input.email)) {
        throw AppError.conflict('That email already has an account', {
          email: ['That email already has an account'],
        });
      }

      const token = generateToken();
      const row = await db.transaction(async (tx) => {
        const repo = invitesRepository(tx);
        await repo.revokePendingForEmail(input.email);
        return repo.insert({
          ...input,
          tokenHash: hashToken(token),
          invitedById: admin.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        });
      });

      return {
        invite: toInvite({
          ...row,
          inviterFirstName: admin.firstName,
          inviterLastName: admin.lastName,
        }),
        url: `${webOrigin}/invite/${token}`,
      } satisfies CreatedInvite;
    },

    async list() {
      return (await invites.list()).map(toInvite);
    },

    async revoke(id: string) {
      const row = await invites.revoke(id);
      if (!row) throw AppError.notFound('No pending invite with that id');
      return toInvite(row);
    },

    async preview(token: string): Promise<InvitePreview> {
      const row = await invites.findUsableByTokenHash(hashToken(token));
      if (!row) throw invalidInvite();
      const { firstName, lastName, email, role, expiresAt } = toInvite(row);
      return { firstName, lastName, email, role, expiresAt };
    },

    /** Claims the invite and creates the account in one transaction. */
    async accept(token: string, password: string) {
      const passwordHash = await hashPassword(password);
      try {
        return await db.transaction(async (tx) => {
          const repo = invitesRepository(tx);
          const invite = await repo.claim(hashToken(token));
          if (!invite) throw invalidInvite();

          const user = await usersRepository(tx).insert({
            role: invite.role,
            email: invite.email,
            firstName: invite.firstName,
            lastName: invite.lastName,
            passwordHash,
          });
          await repo.setAcceptedUser(invite.id, user.id);
          return toSessionUser(user);
        });
      } catch (err) {
        const constraint = uniqueViolation(err);
        if (constraint !== null) throw duplicateUserError(constraint);
        throw err;
      }
    },
  };
}

export type InvitesService = ReturnType<typeof invitesService>;
