import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createLogger } from '../src/lib/logger';

const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
const env = { WEB_ORIGIN: 'http://localhost:5173' };

describe('GET /api/health', () => {
  it('reports ok when the database responds', async () => {
    const app = createApp({ env, logger, pingDb: async () => true });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    const app = createApp({ env, logger, pingDb: async () => false });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.db).toBe('down');
  });
});

describe('error handling', () => {
  const app = createApp({ env, logger, pingDb: async () => true });

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
