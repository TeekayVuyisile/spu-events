import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import type { Env } from '../config/env';
import type { Db } from '../db/client';
import { uploads } from '../db/schema';
import { assertKey, localDiskStorage, UPLOADS_PUBLIC_PATH, type StorageService } from './storage';

/**
 * Files stored in Postgres, for hosts whose disk is wiped on every deploy or
 * restart (Render's free tier). Same keys and URLs as local disk storage.
 */
export function databaseStorage(db: Db): StorageService {
  const serve = Router();
  serve.get('/:folder/:file', async (req, res, next) => {
    const key = `${req.params.folder}/${req.params.file}`;
    try {
      assertKey(key);
    } catch {
      return next();
    }
    const [file] = await db
      .select({ contentType: uploads.contentType, data: uploads.data })
      .from(uploads)
      .where(eq(uploads.key, key));
    if (!file) return next();
    // Keys are unique per upload, so files can be cached forever.
    res
      .type(file.contentType)
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .send(file.data);
  });

  return {
    async put(key, data, contentType) {
      assertKey(key);
      await db
        .insert(uploads)
        .values({ key, contentType, data })
        .onConflictDoUpdate({ target: uploads.key, set: { contentType, data } });
    },
    async copy(fromKey, toKey) {
      assertKey(toKey);
      await db.execute(sql`
        insert into uploads (key, content_type, data)
        select ${toKey}, content_type, data from uploads where key = ${fromKey}
        on conflict (key) do nothing
      `);
    },
    async delete(key) {
      await db.delete(uploads).where(eq(uploads.key, key));
    },
    url: (key) => `${UPLOADS_PUBLIC_PATH}/${key}`,
    serve,
  };
}

/** The storage the environment asks for. */
export function storageFromEnv(env: Pick<Env, 'STORAGE' | 'UPLOADS_DIR'>, db: Db) {
  return env.STORAGE === 'database' ? databaseStorage(db) : localDiskStorage(env.UPLOADS_DIR);
}
