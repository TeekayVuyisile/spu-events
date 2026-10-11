import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { localDiskStorage } from '../src/lib/storage';
import { buildApp, useTestDb } from './helpers';

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
