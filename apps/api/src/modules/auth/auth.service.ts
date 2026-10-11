import { studentNumberSchema, type LoginInput, type SignupInput } from '@spu-events/shared';
import { uniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { toSessionUser, type UsersRepository } from '../users/users.repository';

/** Maps a users-table unique violation to a field error the form can show. */
export function duplicateUserError(constraint: string) {
  return constraint.includes('student')
    ? AppError.conflict('That student number is already registered', {
        studentNumber: ['That student number is already registered'],
      })
    : AppError.conflict('That email already has an account', {
        email: ['That email already has an account'],
      });
}

export function authService({ users }: { users: UsersRepository }) {
  return {
    /** Public sign-up only ever creates students. Staff and admins come from invites. */
    async signup({ password, ...profile }: SignupInput) {
      const passwordHash = await hashPassword(password);
      try {
        const user = await users.insert({ ...profile, role: 'student', passwordHash });
        return toSessionUser(user);
      } catch (err) {
        const constraint = uniqueViolation(err);
        if (constraint !== null) throw duplicateUserError(constraint);
        throw err;
      }
    },

    async login({ identifier, password }: LoginInput) {
      const asStudentNumber = studentNumberSchema.safeParse(identifier);
      const user = asStudentNumber.success
        ? await users.findByStudentNumber(asStudentNumber.data)
        : await users.findByEmail(identifier.toLowerCase());

      // Same message for unknown account and wrong password, so accounts can't be enumerated.
      if (!(await verifyPassword(user?.passwordHash, password)) || !user) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'That login and password don’t match');
      }
      if (user.status !== 'active') {
        throw new AppError(
          403,
          'ACCOUNT_SUSPENDED',
          'This account is suspended. Contact the events office.',
        );
      }
      return toSessionUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof authService>;
