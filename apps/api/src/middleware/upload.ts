import { COVER_MAX_BYTES } from '@monthati/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../lib/errors';

/**
 * Accepts one image file in multipart field `field`, held in memory (max 5 MB).
 * The service checks the actual bytes; this only bounds size and count.
 */
export function singleImage(field: string): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: COVER_MAX_BYTES, files: 1, fields: 0 },
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? `Images must be ${COVER_MAX_BYTES / 1024 / 1024} MB or smaller`
            : 'Send a single image file';
        return next(
          new AppError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'BAD_UPLOAD', message, {
            [field]: [message],
          }),
        );
      }
      if (err) return next(err);
      if (!req.file) {
        return next(
          AppError.badRequest('Choose an image to upload', {
            [field]: ['Choose an image to upload'],
          }),
        );
      }
      next();
    });
  };
}
