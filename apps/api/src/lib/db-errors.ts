/**
 * Returns the violated constraint name if `err` is a Postgres unique violation (23505).
 * Drizzle wraps driver errors, so the pg error may sit on `cause`.
 */
export function uniqueViolation(err: unknown): string | null {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const { code, constraint } = e as { code?: unknown; constraint?: unknown };
    if (code === '23505') return typeof constraint === 'string' ? constraint : '';
  }
  return null;
}
