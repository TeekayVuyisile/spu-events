import { z } from 'zod';
import { roleSchema } from './roles';

/** Emails are trimmed and lowercased before validation, so lookups are case-insensitive. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

export const studentNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{9}$/, 'Student number is 9 digits');

export const PASSWORD_MIN = 10;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(128, 'Use 128 characters or fewer');

const nameSchema = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(60, `${label} is too long`);

export const signupSchema = z.object({
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  studentNumber: studentNumberSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  /** A 9-digit student number, or an email for staff and admin accounts. */
  identifier: z.string().trim().min(1, 'Enter your student number or email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Public demos sign visitors in to a ready-made account for the chosen role with one
 * click. The server signs them in, so the demo password never reaches the browser.
 */
export const demoLoginSchema = z.object({ role: roleSchema });
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;

export interface DemoInfo {
  enabled: boolean;
  /** How often the demo data is wiped and re-seeded, or null if it isn't. */
  resetHours: number | null;
}

/** The signed-in user as the web app sees it. Never includes the password hash. */
export const sessionUserSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  studentNumber: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export interface MeResponse {
  user: SessionUser | null;
}

/** Privileged roles can only be granted through an admin invite. */
export const INVITABLE_ROLES = ['staff', 'admin'] as const;
export const invitableRoleSchema = z.enum(INVITABLE_ROLES, 'Choose a role');
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

export const createInviteSchema = z.object({
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  email: emailSchema,
  role: invitableRoleSchema,
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({ password: passwordSchema });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const INVITE_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export interface Invite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: InvitableRole;
  status: InviteStatus;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Returned once, when the invite is created. The link holds the only copy of the token. */
export interface CreatedInvite {
  invite: Invite;
  url: string;
}

/** What someone opening an invite link is allowed to see. */
export interface InvitePreview {
  firstName: string;
  lastName: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
}
