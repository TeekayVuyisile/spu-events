import type { SessionUser } from '@spu-events/shared';
import { eq } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { users, type NewUser, type User } from '../../db/schema';

/** Drops everything the browser must never see (password hash, timestamps). */
export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    studentNumber: user.studentNumber,
    avatarUrl: user.avatarUrl,
  };
}

/** `db` may be a transaction, so services can compose writes atomically. */
export function usersRepository(db: Executor) {
  return {
    async findById(id: string) {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    },
    async findByEmail(email: string) {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    },
    async findByStudentNumber(studentNumber: string) {
      const [user] = await db.select().from(users).where(eq(users.studentNumber, studentNumber));
      return user;
    },
    async insert(values: NewUser) {
      const [user] = await db.insert(users).values(values).returning();
      return user!;
    },
  };
}

export type UsersRepository = ReturnType<typeof usersRepository>;
