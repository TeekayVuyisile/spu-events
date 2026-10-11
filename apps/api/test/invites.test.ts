import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { invites, users } from '../src/db/schema';
import { PASSWORD, browser, createUser, db, signedIn, useTestDb } from './helpers';

useTestDb();

const newStaff = {
  firstName: 'Sipho',
  lastName: 'Dlamini',
  email: 'Sipho@spu.ac.za',
  role: 'staff',
};

/** Creates an invite as a fresh admin and returns the raw token from the link. */
async function invite(body: object = newStaff) {
  const { agent } = await signedIn('admin');
  const res = await agent.post('/api/admin/invites').send(body);
  expect(res.status).toBe(201);
  const token = new URL(res.body.url).pathname.split('/').pop()!;
  return { agent, res, token };
}

describe('admin invite management', () => {
  it('is closed to signed-out users and non-admins', async () => {
    expect((await browser().get('/api/admin/invites')).status).toBe(401);

    for (const role of ['student', 'staff'] as const) {
      const { agent } = await signedIn(role);
      expect((await agent.get('/api/admin/invites')).status).toBe(403);
      expect((await agent.post('/api/admin/invites').send(newStaff)).status).toBe(403);
    }
  });

  it('creates an invite with a one-time link and lists it', async () => {
    const { agent, res, token } = await invite();

    expect(res.body.url).toMatch(/^http:\/\/localhost:5173\/invite\/[\w-]{43}$/);
    expect(res.body.invite).toMatchObject({ email: 'sipho@spu.ac.za', status: 'pending' });

    const [row] = await db.select().from(invites);
    expect(row!.tokenHash).not.toContain(token);

    const list = await agent.get('/api/admin/invites');
    expect(list.body.invites).toHaveLength(1);
    expect(list.body.invites[0].invitedBy).toMatch(/^Test User/);
  });

  it('never invites a student', async () => {
    const { agent } = await signedIn('admin');
    const res = await agent.post('/api/admin/invites').send({ ...newStaff, role: 'student' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('role');
  });

  it('rejects an email that already has an account', async () => {
    await createUser({ email: 'sipho@spu.ac.za' });
    const { agent } = await signedIn('admin');
    const res = await agent.post('/api/admin/invites').send(newStaff);
    expect(res.status).toBe(409);
  });

  it('retires older links when the same email is invited again', async () => {
    const first = await invite();
    await first.agent.post('/api/admin/invites').send(newStaff);
    expect((await browser().get(`/api/invites/${first.token}`)).status).toBe(404);
  });

  it('revokes a pending invite', async () => {
    const { agent, res, token } = await invite();
    const revoked = await agent.post(`/api/admin/invites/${res.body.invite.id}/revoke`);
    expect(revoked.body.invite.status).toBe('revoked');
    expect((await browser().get(`/api/invites/${token}`)).status).toBe(404);
    expect((await agent.post(`/api/admin/invites/${res.body.invite.id}/revoke`)).status).toBe(404);
  });
});

describe('accepting an invite', () => {
  it('shows who the invite is for', async () => {
    const { token } = await invite();
    const res = await browser().get(`/api/invites/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.invite).toMatchObject({ firstName: 'Sipho', role: 'staff' });
  });

  it('creates the account with the invited role and signs in', async () => {
    const { token } = await invite({ ...newStaff, role: 'admin' });
    const agent = browser();

    const res = await agent.post(`/api/invites/${token}/accept`).send({ password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      role: 'admin',
      email: 'sipho@spu.ac.za',
      studentNumber: null,
    });
    expect((await agent.get('/api/auth/me')).body.user.id).toBe(res.body.user.id);

    const [row] = await db.select().from(invites);
    expect(row!.acceptedUserId).toBe(res.body.user.id);
  });

  it('works only once, even when accepted twice at the same moment', async () => {
    const { token } = await invite();
    const results = await Promise.all(
      [1, 2].map(() => browser().post(`/api/invites/${token}/accept`).send({ password: PASSWORD })),
    );

    expect(results.map((r) => r.status).sort()).toEqual([201, 404]);
    expect(await db.select().from(users).where(eq(users.email, 'sipho@spu.ac.za'))).toHaveLength(1);
  });

  it('rejects expired invites', async () => {
    const { token } = await invite();
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) });

    expect((await browser().get(`/api/invites/${token}`)).status).toBe(404);
    const res = await browser().post(`/api/invites/${token}/accept`).send({ password: PASSWORD });
    expect(res.body.error.code).toBe('INVITE_INVALID');
  });

  it('rejects a made-up token', async () => {
    const res = await browser().get(`/api/invites/${'x'.repeat(43)}`);
    expect(res.status).toBe(404);
  });

  it('enforces the password rules', async () => {
    const { token } = await invite();
    const res = await browser().post(`/api/invites/${token}/accept`).send({ password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('password');
  });
});
