import type { Role } from '@monthati/shared';
import session from 'express-session';
import request from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp, type AppDeps } from '../src/app';
import { createDb } from '../src/db/client';
import { createLogger } from '../src/lib/logger';
import { inProcessBus } from '../src/lib/live-bus';
import { hashPassword } from '../src/lib/password';
import { PaymentDeclinedError, type PaymentProvider } from '../src/lib/payments';
import { memoryStorage } from '../src/lib/storage';
import { usersRepository } from '../src/modules/users/users.repository';
import { testDatabaseUrl } from './test-db-url';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct horse battery';

export const { db, pool } = createDb(testDatabaseUrl());

/** Call at the top of a test file that touches the database. */
export function useTestDb() {
  beforeEach(async () => {
    await pool.query(
      'truncate users, invites, sessions, events, tickets, wallet_ledger, event_staff, scan_logs restart identity cascade',
    );
  });
  afterAll(() => pool.end());
}

export const TICKET_SECRET = 'test-ticket-secret-'.padEnd(40, 'x');

/** Simulated payments that can be told to decline, to test failure paths. */
export function fakePayments() {
  const state = { declineCharges: false, declinePayouts: false, charges: 0, payouts: 0 };
  const provider: PaymentProvider = {
    async charge() {
      if (state.declineCharges) throw new PaymentDeclinedError('Card declined');
      state.charges += 1;
      return `ch_test_${state.charges}`;
    },
    async payout() {
      if (state.declinePayouts) throw new PaymentDeclinedError('Bank rejected the payout');
      state.payouts += 1;
      return `po_test_${state.payouts}`;
    },
  };
  return Object.assign(provider, { state });
}

export function buildApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    env: {
      NODE_ENV: 'test',
      WEB_ORIGIN: ORIGIN,
      SESSION_SECRET: 'test-secret-'.padEnd(40, 'x'),
      TICKET_SIGNING_SECRET: TICKET_SECRET,
    },
    logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    db,
    pingDb: async () => true,
    sessionStore: new session.MemoryStore(),
    storage: memoryStorage(),
    payments: fakePayments(),
    bus: inProcessBus(),
    ...overrides,
  });
}

/** A cookie-keeping browser stand-in that sends the app's Origin like a real browser would. */
export function browser(app = buildApp()) {
  return request.agent(app).set('Origin', ORIGIN);
}

let seq = 0;
export async function createUser(
  overrides: Partial<{ role: Role; email: string; status: 'active' | 'suspended' }> = {},
) {
  seq += 1;
  const role = overrides.role ?? 'student';
  return usersRepository(db).insert({
    role,
    status: overrides.status ?? 'active',
    email: overrides.email ?? `user${seq}@spu.ac.za`,
    firstName: 'Test',
    lastName: `User${seq}`,
    studentNumber: role === 'student' ? String(200000000 + seq) : null,
    passwordHash: await hashPassword(PASSWORD),
  });
}

/** Creates a user of the given role and returns a browser already signed in as them. */
export async function signedIn(role: Role, app = buildApp()) {
  const user = await createUser({ role });
  const agent = browser(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ identifier: user.email, password: PASSWORD });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user, agent };
}
