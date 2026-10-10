import { z } from 'zod';

/** Every API error response has this shape. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Field-level validation messages, keyed by field path. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['up', 'down']),
  time: z.string(),
});
export type Health = z.infer<typeof healthSchema>;
