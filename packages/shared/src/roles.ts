import { z } from 'zod';

export const ROLES = ['student', 'staff', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;
