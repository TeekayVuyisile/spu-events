import type { Role } from '@spu-events/shared';

/** The accounts people sign in with. Everyone else gets an unguessable password. */
export const DEMO_ACCOUNTS = {
  admin: 'admin@spuevents.demo',
  staff: 'gate@spuevents.demo',
  student: 'student@spuevents.demo',
  studentNumber: '202312345',
} as const;

/** The account behind each "Try as …" button. */
export const demoEmailFor = (role: Role) => DEMO_ACCOUNTS[role];

/** Visitors share these, so they must stay usable: no suspending them. */
export const isDemoAccount = (email: string) =>
  email === DEMO_ACCOUNTS.admin || email === DEMO_ACCOUNTS.staff || email === DEMO_ACCOUNTS.student;
