/**
 * Keyset cursors: "<created_at as Postgres text>|<id>". Keeping Postgres's own
 * microsecond timestamp (not a JS Date, which only has milliseconds) means rows
 * created in the same millisecond are neither skipped nor repeated.
 */
export function encodeCursor(createdAtText: string, id: string) {
  return Buffer.from(`${createdAtText}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  return ts && id && /^[0-9a-f-]{36}$/.test(id) ? { ts, id } : null;
}
