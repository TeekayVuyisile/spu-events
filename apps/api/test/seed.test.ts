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
    const upcoming = (await student.get('/api/tickets?scope=upcoming')).body.tickets;
    expect(upcoming).toHaveLength(3);
    expect((await student.get('/api/tickets?scope=past')).body.tickets).toHaveLength(1);

    const events = (await request(app).get('/api/events')).body.events;
    expect(events.every((e: { coverUrl: string | null }) => e.coverUrl)).toBe(true);
    expect(storage.files.size).toBe(11);

    // The gate demo always has a running event, with the demo student's ticket still unscanned.
    const gate = browser(app);
    await gate
      .post('/api/auth/login')
      .send({ identifier: DEMO_ACCOUNTS.staff, password })
      .expect(200);
    const live = events.find((e: { title: string }) => e.title === '24-Hour Study Jam');
    const ticket = upcoming.find((t: { event: { id: string } }) => t.event.id === live.id);
    const scan = await gate.post(`/api/gate/events/${live.id}/scan`).send({ code: ticket.code });
    expect(scan.body.result).toBe('admitted');

    const { rows } = await pool.query('select count(*)::int as n from scan_logs');
    expect(rows[0].n).toBeGreaterThan(10);
  }, 60_000);
});
