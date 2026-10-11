import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { walletLedger } from '../src/db/schema';
import { browser, buildApp, db, fakePayments, signedIn, useTestDb } from './helpers';

useTestDb();

const topUp = (amountCents: number, requestId = randomUUID()) => ({ amountCents, requestId });

describe('wallet access', () => {
  it('is for students only', async () => {
    expect((await browser().get('/api/wallet')).status).toBe(401);
    for (const role of ['staff', 'admin'] as const) {
      const { agent } = await signedIn(role);
      expect((await agent.get('/api/wallet')).status).toBe(403);
    }
  });

  it('starts empty', async () => {
    const { agent } = await signedIn('student');
    expect((await agent.get('/api/wallet')).body).toEqual({ balanceCents: 0, entries: [] });
  });
});

describe('top-ups', () => {
  it('credits the wallet and records the provider reference', async () => {
    const { agent, user } = await signedIn('student');
    const res = await agent.post('/api/wallet/top-ups').send(topUp(15000));

    expect(res.status).toBe(201);
    expect(res.body.balanceCents).toBe(15000);
    expect(res.body.entries[0]).toMatchObject({
      amountCents: 15000,
      kind: 'top_up',
      description: 'Top-up',
      balanceAfterCents: 15000,
    });
    const [row] = await db.select().from(walletLedger);
    expect(row).toMatchObject({ userId: user.id, providerRef: 'ch_test_1' });
  });

  it('never credits the same request twice, even at the same moment', async () => {
    const { agent } = await signedIn('student');
    const body = topUp(5000);
    await Promise.all([1, 2, 3].map(() => agent.post('/api/wallet/top-ups').send(body)));
    const again = await agent.post('/api/wallet/top-ups').send(body);
    expect(again.body.balanceCents).toBe(5000);
  });

  it('enforces the limits', async () => {
    const { agent } = await signedIn('student');
    expect((await agent.post('/api/wallet/top-ups').send(topUp(999))).status).toBe(400);
    expect((await agent.post('/api/wallet/top-ups').send(topUp(200_001))).status).toBe(400);
    expect((await agent.post('/api/wallet/top-ups').send(topUp(1050.5))).status).toBe(400);
  });

  it('credits nothing when the card is declined', async () => {
    const payments = fakePayments();
    payments.state.declineCharges = true;
    const { agent } = await signedIn('student', buildApp({ payments }));

    const res = await agent.post('/api/wallet/top-ups').send(topUp(5000));
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_DECLINED');
    expect((await agent.get('/api/wallet')).body.balanceCents).toBe(0);
  });
});

describe('withdrawals', () => {
  it('debits the wallet and keeps a running balance', async () => {
    const { agent } = await signedIn('student');
    await agent.post('/api/wallet/top-ups').send(topUp(20000));
    const res = await agent.post('/api/wallet/withdrawals').send(topUp(7500));

    expect(res.body.balanceCents).toBe(12500);
    expect(
      res.body.entries.map((e: { amountCents: number; balanceAfterCents: number }) => [
        e.amountCents,
        e.balanceAfterCents,
      ]),
    ).toEqual([
      [-7500, 12500],
      [20000, 20000],
    ]);
  });

  it('refuses to overdraw', async () => {
    const { agent } = await signedIn('student');
    await agent.post('/api/wallet/top-ups').send(topUp(5000));
    const res = await agent.post('/api/wallet/withdrawals').send(topUp(5001));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('can’t be overdrawn by simultaneous withdrawals', async () => {
    const { agent } = await signedIn('student');
    await agent.post('/api/wallet/top-ups').send(topUp(10000));
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => agent.post('/api/wallet/withdrawals').send(topUp(4000))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect((await agent.get('/api/wallet')).body.balanceCents).toBe(2000);
  });

  it('restores the balance if the payout fails', async () => {
    const payments = fakePayments();
    const { agent } = await signedIn('student', buildApp({ payments }));
    await agent.post('/api/wallet/top-ups').send(topUp(10000));
    payments.state.declinePayouts = true;

    const res = await agent.post('/api/wallet/withdrawals').send(topUp(4000));
    expect(res.status).toBe(502);
    const wallet = (await agent.get('/api/wallet')).body;
    expect(wallet.balanceCents).toBe(10000);
    expect(wallet.entries[0].description).toBe('Withdrawal reversed: payout failed');
  });
});
