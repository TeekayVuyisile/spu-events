import type { EventCategory, EventInput } from '@monthati/shared';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client';
import { inProcessBus } from '../lib/live-bus';
import { hashPassword } from '../lib/password';
import { simulatedPayments } from '../lib/payments';
import type { StorageService } from '../lib/storage';
import { ticketSigner } from '../lib/ticket-signing';
import { communityService } from '../modules/community/community.service';
import { eventsService } from '../modules/events/events.service';
import { gateService } from '../modules/gate/gate.service';
import { socialService } from '../modules/social/social.service';
import { ticketsService } from '../modules/tickets/tickets.service';
import { usersRepository } from '../modules/users/users.repository';
import { walletService } from '../modules/wallet/wallet.service';
import { coverPng, mulberry32 } from './covers';

/** The accounts people sign in with. Everyone else gets an unguessable password. */
export const DEMO_ACCOUNTS = {
  admin: 'admin@monthati.demo',
  staff: 'gate@monthati.demo',
  student: 'student@monthati.demo',
  studentNumber: '202312345',
} as const;

const COVER_COLOURS: Record<EventCategory, [string, string]> = {
  party: ['#7c3aed', '#f97316'],
  music: ['#6d28d9', '#db2777'],
  sport: ['#0f766e', '#65a30d'],
  arts: ['#be185d', '#f59e0b'],
  culture: ['#b45309', '#dc2626'],
  academic: ['#4338ca', '#0891b2'],
  career: ['#1e3a8a', '#7c3aed'],
  wellness: ['#047857', '#0ea5e9'],
  other: ['#475569', '#7c3aed'],
};

interface DemoEvent extends Omit<EventInput, 'startsAt' | 'endsAt'> {
  /** Days from today, start hour in campus time, length in hours. */
  day: number;
  hour: number;
  hours: number;
  draft?: boolean;
  /** Share of students who buy a ticket, and of those who were scanned in (past events). */
  demand: number;
  attended?: number;
}

const EVENTS: DemoEvent[] = [
  {
    title: 'Welcome Week Braai',
    category: 'party',
    venue: 'Residence Quad',
    description: 'Start the semester with a braai, music and lawn games.\nBring your student card.',
    day: -9,
    hour: 17,
    hours: 4,
    capacity: 200,
    priceCents: 6000,
    volunteersWanted: false,
    demand: 0.8,
    attended: 0.85,
  },
  {
    title: 'Mental Health Awareness Walk',
    category: 'wellness',
    venue: 'Main Gate',
    description: 'A 5 km walk around campus with Student Wellness. Water and snacks at the end.',
    day: -16,
    hour: 8,
    hours: 3,
    capacity: 400,
    priceCents: 0,
    volunteersWanted: false,
    demand: 0.6,
    attended: 0.7,
  },
  {
    title: 'Campus Quiz Night',
    category: 'academic',
    venue: 'Student Centre',
    description: 'Teams of four, six rounds, prizes for the top three teams.',
    day: 1,
    hour: 18,
    hours: 3,
    capacity: 60,
    priceCents: 0,
    volunteersWanted: false,
    demand: 0.5,
  },
  {
    title: 'Spring Formal',
    category: 'party',
    venue: 'Great Hall',
    description: 'Black tie, live DJ and a photo booth.\nDoors open at 18:30.',
    day: 4,
    hour: 19,
    hours: 5,
    capacity: 300,
    priceCents: 15000,
    volunteersWanted: false,
    demand: 0.7,
  },
  {
    title: 'Jazz on the Lawn',
    category: 'music',
    venue: 'Central Lawn',
    description: 'Student bands from 16:00. Bring a blanket and a friend.',
    day: 6,
    hour: 16,
    hours: 3,
    capacity: 500,
    priceCents: 0,
    volunteersWanted: false,
    demand: 0.6,
  },
  {
    title: 'Inter-res Soccer Final',
    category: 'sport',
    venue: 'Sports Field',
    description: 'The two top residences play for the cup. Wear your colours.',
    day: 9,
    hour: 14,
    hours: 2,
    capacity: 800,
    priceCents: 2000,
    volunteersWanted: false,
    demand: 0.5,
  },
  {
    title: 'Careers Expo 2026',
    category: 'career',
    venue: 'Main Hall',
    description: 'Over 40 employers and CV clinics all day. Bring printed CVs.',
    day: 12,
    hour: 9,
    hours: 7,
    capacity: 1200,
    priceCents: 0,
    volunteersWanted: true,
    demand: 0.4,
  },
  {
    title: 'Poetry & Open Mic',
    category: 'arts',
    venue: 'Library Café',
    description: 'Sign up on the night for a five-minute slot.',
    day: 17,
    hour: 18,
    hours: 3,
    capacity: 12,
    priceCents: 5000,
    volunteersWanted: false,
    demand: 0.75,
  },
  {
    title: 'Heritage Day Celebration',
    category: 'culture',
    venue: 'Amphitheatre',
    description: 'Food stalls, traditional dress and performances from every society.',
    day: 24,
    hour: 11,
    hours: 6,
    capacity: 1000,
    priceCents: 0,
    volunteersWanted: true,
    demand: 0.3,
  },
  {
    title: 'End-of-Year Gala',
    category: 'party',
    venue: 'Great Hall',
    description: 'Details to follow.',
    day: 40,
    hour: 19,
    hours: 5,
    capacity: 400,
    priceCents: 25000,
    volunteersWanted: false,
    demand: 0,
    draft: true,
  },
];

const STUDENTS = [
  ['Lerato', 'Mokoena'],
  ['Kagiso', 'Molefe'],
  ['Naledi', 'Khumalo'],
  ['Thabo', 'Mahlangu'],
  ['Ayanda', 'Zulu'],
  ['Zanele', 'Ndlovu'],
  ['Bongani', 'Sithole'],
  ['Palesa', 'Mofokeng'],
  ['Sizwe', 'Nkosi'],
  ['Refilwe', 'Modise'],
  ['Tumelo', 'Phiri'],
  ['Nomvula', 'Dube'],
  ['Kabelo', 'Tau'],
  ['Amahle', 'Shabalala'],
  ['Lwazi', 'Mthembu'],
  ['Karabo', 'Sekhoto'],
] as const;

const COMMENTS = [
  'Who else is going? Looking for people to share a ride with.',
  'Last year’s one was amazing, can’t wait!',
  'Is there a dress code?',
  'Bringing my whole res 🎉',
  'Will there be vegetarian food?',
];
const REPLIES = ['Smart casual, I think.', 'Count me in!', 'Yes, there was last time.'];

/** A start time `day` days from today at `hour`:00 campus time (UTC+2, no daylight saving). */
function at(day: number, hour: number, now: Date) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + day);
  d.setUTCHours(hour - 2, 0, 0, 0);
  return d;
}

/**
 * Fills an empty database with a believable month of campus life: events with
 * cover art, students with wallets and tickets, past events with check-ins,
 * comments, volunteer applications and a report waiting for moderation.
 *
 * Everything goes through the real services, so the data obeys the same rules
 * as the app. Only history (backdated sales and past check-ins) is written as SQL,
 * because the live rules rightly refuse to sell or scan tickets in the past.
 */
export async function seedDemo({
  db,
  storage,
  signingSecret,
  password,
  log = console.log,
}: {
  db: Db;
  storage: StorageService;
  signingSecret: string;
  password: string;
  log?: (message: string) => void;
}) {
  const rand = mulberry32(2026);
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;
  const now = new Date();

  const users = usersRepository(db);
  const events = eventsService({ db, storage });
  const tickets = ticketsService({ db, storage, signer: ticketSigner(signingSecret) });
  const wallet = walletService({ db, payments: simulatedPayments() });
  const gate = gateService({
    db,
    storage,
    signer: ticketSigner(signingSecret),
    bus: inProcessBus(),
  });
  const social = socialService({ db, storage });
  const community = communityService({ db, storage });

  // ── People ──
  const demoHash = await hashPassword(password);
  const admin = await users.insert({
    role: 'admin',
    email: DEMO_ACCOUNTS.admin,
    firstName: 'Thandi',
    lastName: 'Nkosi',
    passwordHash: demoHash,
  });
  const staff = await users.insert({
    role: 'staff',
    email: DEMO_ACCOUNTS.staff,
    firstName: 'Sipho',
    lastName: 'Dlamini',
    passwordHash: demoHash,
  });
  const otherHash = await hashPassword(randomUUID());
  const students = [];
  for (const [i, [firstName, lastName]] of STUDENTS.entries()) {
    students.push(
      await users.insert({
        role: 'student',
        firstName,
        lastName,
        email:
          i === 0 ? DEMO_ACCOUNTS.student : `${firstName}.${lastName}@monthati.demo`.toLowerCase(),
        studentNumber: i === 0 ? DEMO_ACCOUNTS.studentNumber : `2023${String(10000 + i * 731)}`,
        passwordHash: i === 0 ? demoHash : otherHash,
      }),
    );
  }
  const lerato = students[0]!;
  log(`Created ${students.length + 2} accounts`);

  for (const s of students) {
    await wallet.topUp(s.id, { amountCents: 60_000, requestId: randomUUID() });
  }

  // ── Events, sales, social ──
  const created: { id: string; spec: DemoEvent }[] = [];
  for (const [i, spec] of EVENTS.entries()) {
    // Past events are created in the future, sold, then moved back in time below.
    const day = spec.day < 0 ? 2 : spec.day;
    const startsAt = at(day, spec.hour, now);
    const { title, category, venue, description, capacity, priceCents, volunteersWanted } = spec;
    const event = await events.create(
      {
        title,
        category,
        venue,
        description,
        capacity,
        priceCents,
        volunteersWanted,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + spec.hours * 3_600_000).toISOString(),
      },
      admin.id,
    );
    const [from, to] = COVER_COLOURS[spec.category];
    await events.setCover(event.id, coverPng(from, to, i + 1));
    created.push({ id: event.id, spec });
    if (spec.draft) continue;

    await events.publish(event.id);
    await gate.assignStaff(event.id, [staff.id]);
    // The demo student holds tickets to a past and two upcoming events.
    const leratoGoes = ['Welcome Week Braai', 'Spring Formal', 'Jazz on the Lawn'].includes(
      spec.title,
    );
    for (const s of students) {
      const buys = s === lerato ? leratoGoes : rand() < spec.demand;
      if (buys) {
        await tickets.purchase(s.id, event.id).catch((err: Error) => {
          // Sold out is part of the story (Poetry & Open Mic); anything else is a bug.
          if (!/sold out/i.test(err.message)) throw err;
        });
      }
      if (rand() < 0.35) await social.likeEvent(s, event.id, true);
    }

    if (spec.day > 0 && rand() < 0.8) {
      const first = await social.addComment(pick(students), event.id, { body: pick(COMMENTS) });
      await social.addComment(pick(students), event.id, {
        body: pick(REPLIES),
        parentId: first.id,
      });
    }
  }
  log(`Created ${created.length} events`);

  const byTitle = (title: string) => created.find((e) => e.spec.title === title)!.id;

  // Work waiting for the admin: volunteers to review and a comment to moderate.
  const expo = byTitle('Careers Expo 2026');
  await community.apply(lerato.id, expo, {
    role: 'Registration desk',
    motivation: 'I ran the desk at our faculty open day and enjoy helping people find their way.',
  });
  await community.apply(students[3]!.id, expo, {
    role: 'Usher',
    motivation: 'I want to meet employers and help the day run smoothly.',
  });
  const spam = await social.addComment(students[9]!, byTitle('Spring Formal'), {
    body: 'Selling 2 tickets cheap!! DM me on WhatsApp for a deal',
  });
  await community.report(students[4]!, {
    targetType: 'comment',
    targetId: spam.id,
    reason: 'spam',
    details: 'Reselling tickets outside the app',
  });

  // ── History: move past events back in time and spread sales over the month ──
  for (const { id, spec } of created.filter((e) => e.spec.day < 0)) {
    const startsAt = at(spec.day, spec.hour, now);
    const endsAt = new Date(startsAt.getTime() + spec.hours * 3_600_000);
    await db.execute(
      sql`update events set starts_at = ${startsAt.toISOString()}, ends_at = ${endsAt.toISOString()} where id = ${id}`,
    );
    // Scan in a share of holders during the first hour, as the gate would have.
    await db.execute(sql`
      with admitted as (
        update tickets
        set status = 'used',
            checked_in_at = ${startsAt.toISOString()}::timestamptz + random() * interval '1 hour',
            checked_in_by_id = ${staff.id},
            checked_in_gate = 'Main gate'
        where event_id = ${id} and status = 'valid' and random() < ${spec.attended ?? 0}
        returning id, checked_in_at
      )
      insert into scan_logs (event_id, ticket_id, staff_id, result, gate, created_at)
      select ${id}, id, ${staff.id}, 'admitted', 'Main gate', checked_in_at from admitted
    `);
  }
  await db.execute(sql`
    update tickets t
    set created_at = greatest(
      now() - interval '27 days',
      least(now(), e.starts_at - interval '1 day') - random() * interval '14 days'
    )
    from events e
    where e.id = t.event_id
  `);
  await db.execute(sql`
    update wallet_ledger l set created_at = t.created_at from tickets t where l.ticket_id = t.id
  `);
  await db.execute(sql`
    update wallet_ledger set created_at = now() - interval '28 days' + random() * interval '2 days'
    where kind = 'top_up'
  `);
  await db.execute(sql`
    update users set created_at = now() - interval '45 days' + random() * interval '10 days'
  `);
  await db.execute(sql`
    update notifications n set created_at = t.created_at
    from tickets t where n.link = '/tickets/' || t.id
  `);
  log('Backdated sales and check-ins');
}
