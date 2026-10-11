import { z } from 'zod';
import type { EventCategory } from './events';
import { roleSchema, type Role } from './roles';
import type { TicketStatus } from './tickets';
import type { LedgerEntry } from './wallet';

// ── Dashboard ─────────────────────────────────────────────────

export const DASHBOARD_RANGES = ['7d', '30d', '90d'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export const DASHBOARD_RANGE_DAYS: Record<DashboardRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const dashboardQuerySchema = z.object({
  range: z.enum(DASHBOARD_RANGES).default('30d').catch('30d'),
});

/** A KPI for the chosen range and the same-length range before it. */
export interface Kpi {
  value: number | null;
  previous: number | null;
}

export interface Dashboard {
  range: DashboardRange;
  kpis: {
    /** Ticket sales minus refunds, in cents. */
    revenueCents: Kpi;
    /** Tickets issued in the range that are still active. */
    ticketsSold: Kpi;
    /** Share (0–1) of active tickets checked in, for events that ended in the range. */
    checkInRate: Kpi;
    /** Students who got a ticket, liked, commented or posted a photo in the range. */
    activeStudents: Kpi;
  };
  /** One row per campus-time day, oldest first, with no gaps. */
  daily: { date: string; tickets: number; revenueCents: number }[];
  byCategory: { category: EventCategory; tickets: number }[];
  /** The best-selling events among those that start in the range or later. */
  topEvents: {
    id: string;
    title: string;
    startsAt: string;
    capacity: number;
    ticketsSold: number;
    checkedIn: number;
    revenueCents: number;
  }[];
  attention: { openReports: number; pendingVolunteers: number; draftEvents: number };
}

// ── Users ─────────────────────────────────────────────────────

export const USER_STATUSES = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_USER_PAGE_SIZE = 25;

export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  role: roleSchema.optional().catch(undefined),
  status: z.enum(USER_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export interface AdminUserSummary {
  id: string;
  role: Role;
  status: UserStatus;
  firstName: string;
  lastName: string;
  email: string;
  studentNumber: string | null;
  createdAt: string;
}

export interface AdminUserPage {
  users: AdminUserSummary[];
  total: number;
  nextPage: number | null;
}

export const AUDIT_ACTIONS = ['user_suspended', 'user_reinstated', 'wallet_adjusted'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorName: string | null;
  reason: string;
  /** Signed amount for wallet adjustments. */
  amountCents: number | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  /** Students only: wallets belong to students. */
  balanceCents: number | null;
  stats: { activeTickets: number; attended: number; comments: number; reportsAgainst: number };
  tickets: {
    id: string;
    code: string;
    status: TicketStatus;
    pricePaidCents: number;
    createdAt: string;
    event: { id: string; title: string; startsAt: string };
  }[];
  ledger: LedgerEntry[];
  history: AuditEntry[];
}

const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Give a reason (at least 5 characters)')
  .max(300, 'Keep it under 300 characters');

export const suspendUserSchema = z.object({ reason: reasonSchema });
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const reinstateUserSchema = z.object({ reason: reasonSchema });
export type ReinstateUserInput = z.infer<typeof reinstateUserSchema>;

export const ADJUSTMENT_MAX_CENTS = 1_000_000; // R10 000

/**
 * A manual credit or debit. Every one is logged with its reason, and `requestId`
 * makes a double-submit harmless.
 */
export const walletAdjustmentSchema = z.object({
  direction: z.enum(['credit', 'debit'], 'Choose credit or debit'),
  amountCents: z
    .number('Enter an amount')
    .int()
    .min(1, 'Enter an amount')
    .max(ADJUSTMENT_MAX_CENTS, 'At most R10 000 per adjustment'),
  reason: reasonSchema,
  requestId: z.uuid(),
});
export type WalletAdjustmentInput = z.infer<typeof walletAdjustmentSchema>;

// ── Attendees ─────────────────────────────────────────────────

export interface Attendee {
  ticketId: string;
  code: string;
  status: TicketStatus;
  name: string;
  email: string;
  studentNumber: string | null;
  pricePaidCents: number;
  purchasedAt: string;
  checkedInAt: string | null;
  checkedInGate: string | null;
}

export interface AttendeeList {
  event: { id: string; title: string; capacity: number };
  attendees: Attendee[];
}
