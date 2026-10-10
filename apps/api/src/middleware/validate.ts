import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors';

type Part = 'body' | 'query' | 'params';

/**
 * Validates one part of the request against a shared Zod schema.
 * The parsed (coerced, unknown keys stripped) value is stored on res.locals.valid[part].
 */
export function validate(part: Part, schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (fields[key] ??= []).push(issue.message);
      }
      return next(AppError.badRequest('Some fields need attention', fields));
    }
    res.locals.valid = { ...res.locals.valid, [part]: result.data };
    next();
  };
}
