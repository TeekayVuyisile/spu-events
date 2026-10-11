/**
 * Creates the first admin account. Public sign-up never creates admins, and
 * invites need an existing admin, so this is how a fresh install gets started.
 *
 *   npm run user:create-admin -- --email you@spu.ac.za --first-name Thandi --last-name Nkosi
 *
 * The password is prompted for (hidden), or read from ADMIN_PASSWORD for scripts.
 */
import { emailSchema, passwordSchema } from '@monthati/shared';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadEnv } from '../config/env';
import { createDb } from '../db/client';
import { uniqueViolation } from '../lib/db-errors';
import { hashPassword } from '../lib/password';
import { usersRepository } from '../modules/users/users.repository';

const argsSchema = z.object({
  email: emailSchema,
  'first-name': z.string().trim().min(1, 'is required'),
  'last-name': z.string().trim().min(1, 'is required'),
});

function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Suppress echo of typed characters after the question has been printed.
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (s.includes(question)) write.call(rl, s);
    };
  });
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    'first-name': { type: 'string' },
    'last-name': { type: 'string' },
  },
});

const args = argsSchema.safeParse(values);
if (!args.success) {
  fail(
    `Usage: npm run user:create-admin -- --email <email> --first-name <name> --last-name <name>\n` +
      args.error.issues.map((i) => `  --${i.path.join('.')}: ${i.message}`).join('\n'),
  );
}

const rawPassword = process.env.ADMIN_PASSWORD ?? (await promptHidden('Password: '));
const password = passwordSchema.safeParse(rawPassword);
if (!password.success) fail(`Password: ${password.error.issues[0]?.message}`);

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
try {
  const user = await usersRepository(db).insert({
    role: 'admin',
    email: args.data.email,
    firstName: args.data['first-name'],
    lastName: args.data['last-name'],
    passwordHash: await hashPassword(password.data),
  });
  console.log(`✔ Admin created: ${user.firstName} ${user.lastName} <${user.email}>`);
} catch (err) {
  if (uniqueViolation(err) !== null) fail(`${args.data.email} already has an account`);
  throw err;
} finally {
  await pool.end();
}
