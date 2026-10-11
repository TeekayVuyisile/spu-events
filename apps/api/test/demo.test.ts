import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../src/lib/storage';
import { DEMO_ACCOUNTS } from '../src/seed/accounts';
import { refreshDemo } from '../src/seed/refresh';
import {
  browser,
  buildApp,
  createUser,
  db,
  pool,
  signedIn,
  TICKET_SECRET,
  useTestDb,
} from './helpers';

useTestDb();

const demoApp = () => buildApp({ demo: { resetHours: 6 } });

describe('demo sign-in', () => {
  it('is switched off unless the deployment is a demo', async () => {
    const agent = browser();
    expect((await agent.get('/api/demo')).body).toEqual({ enabled: false, resetHours: null });
    expect((await agent.post('/api/demo/login').send({ role: 'admin' })).status).toBe(404);
  });

  it('signs visitors in to the demo account for the role they pick, without a password', async () => {
    await createUser({ role: 'admin', email: DEMO_ACCOUNTS.admin });
    await createUser({ role: 'student', email: DEMO_ACCOUNTS.student });
    const app = demoApp();

    const agent = browser(app);
    expect((await agent.get('/api/demo')).body).toEqual({ enabled: true, resetHours: 6 });
    const res = await agent.post('/api/demo/login').send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'admin', email: DEMO_ACCOUNTS.admin });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect((await agent.get('/api/admin/dashboard?range=30d')).status).toBe(200);

    const student = browser(app);
    await student.post('/api/demo/login').send({ role: 'student' }).expect(200);
    expect((await student.get('/api/auth/me')).body.user.email).toBe(DEMO_ACCOUNTS.student);
  });

  it('asks visitors to wait while the demo data is being reset, and rejects unknown roles', async () => {
    const agent = browser(demoApp());
    const missing = await agent.post('/api/demo/login').send({ role: 'staff' });
    expect(missing.status).toBe(503);
    expect(missing.body.error.code).toBe('DEMO_UNAVAILABLE');
    expect((await agent.post('/api/demo/login').send({ role: 'owner' })).status).toBe(400);
  });

  it('keeps the shared demo accounts from being suspended', async () => {
    const student = await createUser({ role: 'student', email: DEMO_ACCOUNTS.student });
    const other = await createUser({ role: 'student' });
    const { agent } = await signedIn('admin');

    const res = await agent
      .post(`/api/admin/users/${student.id}/suspend`)
      .send({ reason: 'Spamming the comments' });
    expect(res.status).toBe(403);
    await agent
      .post(`/api/admin/users/${other.id}/suspend`)
      .send({ reason: 'Spamming the comments' })
      .expect(200);
  });
});

describe('demo refresh', () => {
  const options = {
    db,
    storage: memoryStorage(),
    signingSecret: TICKET_SECRET,
    password: 'demo-password-123',
    log: () => {},
  };
  const userCount = async () =>
    (await pool.query('select count(*)::int as n from users')).rows[0].n as number;

  it('seeds an empty database, then resets it once the data is stale', async () => {
    expect(await refreshDemo({ ...options, resetHours: 6 })).toBe('seeded');
    const seeded = await userCount();

    // A visitor signs up; the next reset clears them away.
    await createUser({ role: 'student' });
    expect(await refreshDemo({ ...options, resetHours: 6 })).toBe('fresh');
    expect(await userCount()).toBe(seeded + 1);

    const later = () => new Date(Date.now() + 7 * 3_600_000);
    expect(await refreshDemo({ ...options, resetHours: 6, now: later })).toBe('reset');
    expect(await userCount()).toBe(seeded);
    const { rows } = await pool.query('select seeded_at from demo_state');
    expect(Date.now() - rows[0].seeded_at.getTime()).toBeLessThan(60_000);
  }, 120_000);

  it('never wipes a database with accounts unless resets are switched on', async () => {
    await createUser({ role: 'student' });
    expect(await refreshDemo(options)).toBe('kept');
    expect(await userCount()).toBe(1);
  });
});
