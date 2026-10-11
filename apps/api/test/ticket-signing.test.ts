import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateTicketCode, ticketSigner } from '../src/lib/ticket-signing';

const signer = ticketSigner('a'.repeat(40));
const id = randomUUID();

describe('ticket QR signing', () => {
  it('verifies its own payloads', () => {
    expect(signer.verify(signer.payload(id))).toBe(id);
  });

  it('rejects a payload pointed at another ticket', () => {
    const [version, , signature] = signer.payload(id).split('.');
    expect(signer.verify(`${version}.${randomUUID()}.${signature}`)).toBeNull();
  });

  it('rejects a tampered or truncated signature', () => {
    const payload = signer.payload(id);
    const flipped = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A');
    expect(signer.verify(flipped)).toBeNull();
    expect(signer.verify(payload.slice(0, -4))).toBeNull();
  });

  it('rejects payloads signed with a different secret', () => {
    expect(signer.verify(ticketSigner('b'.repeat(40)).payload(id))).toBeNull();
  });

  it('rejects junk', () => {
    for (const junk of ['', 'hello', 'MTH1..', `MTH0.${id}.abc`, `${signer.payload(id)}.extra`]) {
      expect(signer.verify(junk)).toBeNull();
    }
  });
});

describe('ticket codes', () => {
  it('look like MTH-XXXX-XXXX without ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTicketCode()).toMatch(/^MTH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});
