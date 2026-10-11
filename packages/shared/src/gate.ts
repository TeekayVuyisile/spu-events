import { z } from 'zod';
import type { EventSummary } from './events';

/** Gates open this long before an event starts and close when it ends. */
export const DOORS_OPEN_HOURS = 3;

export const SCAN_RESULTS = [
  'admitted',
  'already_used',
  'invalid',
  'wrong_event',
  'cancelled',
  'not_open',
] as const;
export type ScanResultKind = (typeof SCAN_RESULTS)[number];

/** A scan sends either the QR payload or the short code typed by hand. */
export const scanInputSchema = z
  .object({
    payload: z.string().trim().max(200).optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^SPU-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Codes look like SPU-7Q4K-29XD')
      .optional(),
    /** Free-text gate name shown on "already used" results, e.g. "Gate B". */
    gate: z.string().trim().max(40).optional(),
  })
  .refine((v) => Boolean(v.payload) !== Boolean(v.code), {
    message: 'Send a QR payload or a ticket code',
    path: ['code'],
  });
export type ScanInput = z.infer<typeof scanInputSchema>;

export interface GateStats {
  checkedIn: number;
  ticketsSold: number;
  capacity: number;
}

export interface ScanResult {
  result: ScanResultKind;
  /** Human-readable explanation for the result screen. */
  message: string;
  ticket: {
    code: string;
    holderName: string;
    holderAvatarUrl: string | null;
    checkedInAt: string | null;
    checkedInBy: string | null;
    gate: string | null;
  } | null;
  stats: GateStats;
}

/** An event as gate staff see it: what to scan and how it's going. */
export interface GateEvent extends EventSummary {
  checkedIn: number;
}

export interface ScanLogEntry {
  id: string;
  result: ScanResultKind;
  ticketCode: string | null;
  holderName: string | null;
  staffName: string;
  gate: string | null;
  createdAt: string;
}

/** What the live stream sends after every scan. */
export interface LiveGateUpdate {
  stats: GateStats;
  scan: ScanLogEntry;
}

export const assignStaffSchema = z.object({
  userIds: z.array(z.uuid()).max(100),
});
export type AssignStaffInput = z.infer<typeof assignStaffSchema>;

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'staff' | 'admin';
}
