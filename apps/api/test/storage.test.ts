import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { databaseStorage } from '../src/lib/db-storage';
import { localDiskStorage } from '../src/lib/storage';
import { buildApp, db, useTestDb } from './helpers';

useTestDb();

const dir = await mkdtemp(path.join(tmpdir(), 'monthati-uploads-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('local disk storage', () => {
  const storage = localDiskStorage(dir);
  const app = buildApp({ storage });

  it('serves stored files with long-lived caching', async () => {
    await storage.put('events/abc-123.png', Buffer.from('png-bytes'), 'image/png');
    const res = await request(app).get(storage.url('events/abc-123.png'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('deletes files, and tolerates deleting twice', async () => {
    await storage.delete('events/abc-123.png');
    await storage.delete('events/abc-123.png');
    expect((await request(app).get('/api/uploads/events/abc-123.png')).status).toBe(404);
  });

  it('refuses keys that could escape the uploads folder', async () => {
    await expect(storage.put('../evil.png', Buffer.from('x'), 'image/png')).rejects.toThrow();
    await expect(
      storage.put('events/../../evil.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow();
  });
});

describe('database storage', () => {
  const storage = databaseStorage(db);
  const app = buildApp({ storage });

  it('stores, serves, copies and deletes files', async () => {
    await storage.put('events/abc-123.png', Buffer.from('png-bytes'), 'image/png');
    await storage.copy('events/abc-123.png', 'events/abc-456.png');

    const res = await request(app).get(storage.url('events/abc-456.png'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(Buffer.from(res.body).toString()).toBe('png-bytes');

    await storage.delete('events/abc-123.png');
    await storage.delete('events/abc-123.png');
    expect((await request(app).get('/api/uploads/events/abc-123.png')).status).toBe(404);
    expect((await request(app).get('/api/uploads/events/..%2Fevil.png')).status).toBe(404);
  });

  it('refuses keys outside the expected shape', async () => {
    await expect(storage.put('../evil.png', Buffer.from('x'), 'image/png')).rejects.toThrow();
  });
});

describe('serving the web app', () => {
  const app = buildApp({ webDist: path.join(dir, 'web') });

  it('serves built files, falls back to index.html for app routes, and leaves /api alone', async () => {
    await mkdir(path.join(dir, 'web', 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'web', 'index.html'), '<div id="root"></div>');
    await writeFile(path.join(dir, 'web', 'assets', 'index-abc.js'), 'console.log(1)');

    const asset = await request(app).get('/assets/index-abc.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    const page = await request(app).get('/events/spring-formal-k3x9');
    expect(page.status).toBe(200);
    expect(page.text).toContain('id="root"');
    expect(page.headers['cache-control']).toBe('no-cache');

    const api = await request(app).get('/api/nope');
    expect(api.status).toBe(404);
    expect(api.body.error.code).toBe('NOT_FOUND');
  });
});
