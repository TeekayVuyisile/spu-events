import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../src/lib/storage';
import { DEMO_ACCOUNTS, seedDemo } from '../src/seed/demo';
import { browser, buildApp, db, pool, TICKET_SECRET, useTestDb } from './helpers';

useTestDb();

describe('demo seed', () => {
  it('fills an empty database that the demo accounts can use straight away', async () => {
    const storage = memoryStorage();
    const password = 'demo-password-123';
    await seedDemo({ db, storage, signingSecret: TICKET_SECRET, password, log: () => {} });

    const app = buildApp({ storage });
    const admin = browser(app);
    const login = await admin
      .post('/api/auth/login')
      .send({ identifier: DEMO_ACCOUNTS.admin, password });
    expect(login.status).toBe(200);

    const { dashboard } = (await admin.get('/api/admin/dashboard?range=30d')).body;
    expect(dashboard.kpis.ticketsSold.value).toBeGreaterThan(20);
    expect(dashboard.kpis.checkInRate.value).toBeGreaterThan(0.5);
    // Everything sold inside the window, so changes read "New" instead of thousands of percent.
    expect(dashboard.kpis.ticketsSold.previous).toBe(0);
    expect(dashboard.attention).toEqual({ openReports: 1, pendingVolunteers: 2, draftEvents: 1 });

    const student = browser(app);
    await student
      .post('/api/auth/login')
      .send({ identifier: DEMO_ACCOUNTS.studentNumber, password })
      .expect(200);
    expect((await student.get('/api/tickets?scope=upcoming')).body.tickets).toHaveLength(2);
    expect((await student.get('/api/tickets?scope=past')).body.tickets).toHaveLength(1);

    const events = (await request(app).get('/api/events')).body.events;
    expect(events.every((e: { coverUrl: string | null }) => e.coverUrl)).toBe(true);
    expect(storage.files.size).toBe(10);

    const { rows } = await pool.query('select count(*)::int as n from scan_logs');
    expect(rows[0].n).toBeGreaterThan(10);
  }, 60_000);
});
