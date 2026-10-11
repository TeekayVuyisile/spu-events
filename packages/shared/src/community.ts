import { z } from 'zod';
import type { PublicAuthor } from './social';

// ── Volunteers ────────────────────────────────────────────────

export const VOLUNTEER_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];

export const volunteerApplySchema = z.object({
  role: z.string().trim().min(2, 'What would you like to help with?').max(60, 'Keep it short'),
  motivation: z
    .string()
    .trim()
    .min(10, 'Tell the organisers a little more (at least 10 characters)')
    .max(500, 'Keep it under 500 characters'),
});
export type VolunteerApplyInput = z.infer<typeof volunteerApplySchema>;

export interface VolunteerApplication {
  id: string;
  role: string;
  motivation: string;
  status: VolunteerStatus;
  createdAt: string;
  decidedAt: string | null;
}

/** The admin's view: who applied. */
export interface VolunteerApplicant extends VolunteerApplication {
  student: { id: string; name: string; email: string; studentNumber: string | null };
}

export const volunteerDecisionSchema = z.object({
  decision: z.enum(['accept', 'decline']),
});

// ── Reports and moderation ────────────────────────────────────

export const REPORT_TARGETS = ['comment', 'photo'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or advertising',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate or offensive',
  other: 'Something else',
};

export const reportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGETS),
    targetId: z.uuid(),
    reason: z.enum(REPORT_REASONS, 'Choose a reason'),
    details: z.string().trim().max(500, 'Keep it under 500 characters').default(''),
  })
  .refine((r) => r.reason !== 'other' || r.details.length >= 5, {
    path: ['details'],
    message: 'Tell us what’s wrong (at least 5 characters)',
  });
export type ReportInput = z.infer<typeof reportSchema>;

export const MODERATION_ACTIONS = [
  'dismiss',
  'remove',
  'remove_and_warn',
  'remove_and_suspend',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const moderationActionSchema = z.object({
  action: z.enum(MODERATION_ACTIONS),
  /** Optional note included in the author's notification. */
  note: z.string().trim().max(300).default(''),
});
export type ModerationActionInput = z.infer<typeof moderationActionSchema>;

/** One reported item in the queue, with every open report against it. */
export interface ModerationItem {
  targetType: ReportTarget;
  targetId: string;
  /** Comment text or photo caption; null if already gone. */
  text: string | null;
  photoUrl: string | null;
  author: (PublicAuthor & { email: string; status: 'active' | 'suspended' }) | null;
  event: { id: string; title: string; slug: string };
  reports: {
    id: string;
    reason: ReportReason;
    details: string;
    reporterName: string;
    createdAt: string;
  }[];
  firstReportedAt: string;
}
