import { passwordSchema } from '@monthati/shared';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** Signs the session cookie. Generate with: node -e "console.log(crypto.randomBytes(32).toString('hex'))" */
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Signs ticket QR codes. Changing it invalidates every issued QR code. */
  TICKET_SIGNING_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Local folder for uploaded files (relative to apps/api). Ignored by git. */
  UPLOADS_DIR: z.string().default('uploads'),
  /** Where uploads live: `disk` (UPLOADS_DIR) or `database` for hosts whose disk is wiped on deploy. */
  STORAGE: z.enum(['disk', 'database']).default('disk'),
  /** Built web app (apps/web/dist) to serve from the API in production, on the same origin. */
  WEB_DIST_DIR: z.string().optional(),
  /** When set, `release` fills an empty database with demo data; the demo accounts use this password. */
  DEMO_PASSWORD: passwordSchema.optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Parses process.env once at startup and fails fast with a readable message. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // On Render the site's public URL is provided as RENDER_EXTERNAL_URL.
  const parsed = envSchema.safeParse({
    ...source,
    WEB_ORIGIN: source.WEB_ORIGIN ?? source.RENDER_EXTERNAL_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
