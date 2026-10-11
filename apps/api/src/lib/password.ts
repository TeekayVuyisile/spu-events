import { hash, verify } from '@node-rs/argon2';

/** Argon2id with the library's OWASP-aligned defaults. */
export function hashPassword(password: string) {
  return hash(password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When there is no stored hash (unknown account) it still
 * runs a full verification against a throwaway hash, so response time doesn't
 * reveal which accounts exist.
 */
export async function verifyPassword(storedHash: string | undefined, password: string) {
  if (storedHash) return verify(storedHash, password);
  dummyHash ??= hash('not-a-real-password');
  await verify(await dummyHash, password);
  return false;
}
