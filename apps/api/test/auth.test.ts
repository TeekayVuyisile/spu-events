import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../src/db/schema';
import { PASSWORD, browser, createUser, db, useTestDb } from './helpers';

useTestDb();

const signup = {
  firstName: 'Lerato',
  lastName: 'Mokoena',
  studentNumber: '202312345',
  email: 'Lerato@SPU.ac.za',
  password: PASSWORD,
};

describe('POST /api/auth/signup', () => {
  it('creates a student and signs them in', async () => {
    const agent = browser();
    const res = await agent.post('/api/auth/signup').send(signup);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'student', email: 'lerato@spu.ac.za' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^mth\.sid=.*HttpOnly.*SameSite=Lax/i);

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.id).toBe(res.body.user.id);
  });

  it('stores an argon2 hash, never the password', async () => {
    await browser().post('/api/auth/signup').send(signup);
    const [row] = await db.select().from(users).where(eq(users.email, 'lerato@spu.ac.za'));
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('ignores an attempt to sign up as admin', async () => {
    const res = await browser()
      .post('/api/auth/signup')
      .send({ ...signup, role: 'admin' });
    expect(res.body.user.role).toBe('student');
  });

  it('reports duplicate email and student number on the right field', async () => {
    await browser().post('/api/auth/signup').send(signup);

    const sameEmail = await browser()
      .post('/api/auth/signup')
      .send({ ...signup, studentNumber: '209999999' });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.error.fields).toHaveProperty('email');

    const sameNumber = await browser()
      .post('/api/auth/signup')
      .send({ ...signup, email: 'other@spu.ac.za' });
    expect(sameNumber.status).toBe(409);
    expect(sameNumber.body.error.fields).toHaveProperty('studentNumber');
  });

  it('returns field errors for invalid input', async () => {
    const res = await browser()
      .post('/api/auth/signup')
      .send({ ...signup, studentNumber: '123', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['password', 'studentNumber']);
  });
});

describe('POST /api/auth/login', () => {
  it('accepts a student number', async () => {
    const user = await createUser();
    const res = await browser()
      .post('/api/auth/login')
      .send({ identifier: user.studentNumber, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('accepts an email in any case', async () => {
    const user = await createUser({ role: 'staff', email: 'gate@spu.ac.za' });
    const res = await browser()
      .post('/api/auth/login')
      .send({ identifier: ' GATE@spu.ac.za', password: PASSWORD });
    expect(res.body.user.id).toBe(user.id);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const user = await createUser();
    const wrong = await browser()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: 'not the password' });
    const unknown = await browser()
      .post('/api/auth/login')
      .send({ identifier: 'nobody@spu.ac.za', password: PASSWORD });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('refuses suspended accounts', async () => {
    const user = await createUser({ status: 'suspended' });
    const res = await browser()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('issues a new session id on login', async () => {
    const user = await createUser();
    const agent = browser();
    const sid = async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({ identifier: user.email, password: PASSWORD });
      return /mth\.sid=([^;]+)/.exec(res.headers['set-cookie']?.[0] ?? '')?.[1];
    };
    const first = await sid();
    const second = await sid();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });
});

describe('sessions', () => {
  it('reports signed out as user: null', async () => {
    const res = await browser().get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  it('logs out', async () => {
    const user = await createUser();
    const agent = browser();
    await agent.post('/api/auth/login').send({ identifier: user.email, password: PASSWORD });

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('drops a session as soon as the account is suspended', async () => {
    const user = await createUser();
    const agent = browser();
    await agent.post('/api/auth/login').send({ identifier: user.email, password: PASSWORD });

    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, user.id));
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });
});
