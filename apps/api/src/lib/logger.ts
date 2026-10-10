import { pino } from 'pino';
import type { Env } from '../config/env';

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>) {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
    redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash'],
  });
}

export type Logger = ReturnType<typeof createLogger>;
