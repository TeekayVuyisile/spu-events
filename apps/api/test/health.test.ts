import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp, useTestDb } from './helpers';

useTestDb();

describe('GET /api/health', () => {
  it('reports ok when the database responds', async () => {
    const res = await request(buildApp({ pingDb: async () => true })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    const res = await request(buildApp({ pingDb: async () => false })).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.db).toBe('down');
  });
});

describe('error handling', () => {
  const app = buildApp();

  it('returns the shared error shape for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/nope')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });
});

describe('cross-site request protection', () => {
  const app = buildApp();
  const login = { identifier: 'x@spu.ac.za', password: 'whatever' };

  it('blocks state-changing requests without an Origin', async () => {
    const res = await request(app).post('/api/auth/login').send(login);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });

  it('blocks requests from another site', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send(login);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });

  it('lets reads through without an Origin', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
  });
});
