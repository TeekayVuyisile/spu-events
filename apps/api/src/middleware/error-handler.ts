import type { ApiError } from '@spu-events/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiError = {
      error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
    };
    return res.status(err.status).json(body);
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    const body: ApiError = {
      error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' },
    };
    return res.status(400).json(body);
  }

  req.log.error({ err }, 'Unhandled error');
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Something went wrong' } };
  res.status(500).json(body);
};
