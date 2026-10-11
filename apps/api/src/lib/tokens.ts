import { createHash, randomBytes } from 'node:crypto';

/** 256-bit URL-safe random token, for links that grant access (invites, later password resets). */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored hashed, so a database leak doesn't hand out working links. */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
