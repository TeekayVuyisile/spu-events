import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * QR payload: `MTH1.<ticketId>.<signature>`. The signature is an HMAC-SHA256 of
 * the prefix and id with a server-only secret, so a QR code can't be forged or
 * edited to point at another ticket. Scanning (phase 4) only needs `verify`.
 */
const VERSION = 'MTH1';

export function ticketSigner(secret: string) {
  const sign = (ticketId: string) =>
    createHmac('sha256', secret).update(`${VERSION}.${ticketId}`).digest('base64url').slice(0, 32);

  return {
    payload: (ticketId: string) => `${VERSION}.${ticketId}.${sign(ticketId)}`,

    /** Returns the ticket id if the payload is genuine, otherwise null. */
    verify(payload: string): string | null {
      const [version, ticketId, signature, ...rest] = payload.trim().split('.');
      if (version !== VERSION || !ticketId || !signature || rest.length) return null;
      const expected = Buffer.from(sign(ticketId));
      const given = Buffer.from(signature);
      return expected.length === given.length && timingSafeEqual(expected, given) ? ticketId : null;
    },
  };
}

export type TicketSigner = ReturnType<typeof ticketSigner>;

// No 0/O or 1/I, so codes read aloud or typed at the gate aren't misread.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** MTH-7Q4K-29XD */
export function generateTicketCode() {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `MTH-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}
