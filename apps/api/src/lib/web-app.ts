import express, { type RequestHandler } from 'express';
import path from 'node:path';

/**
 * Serves the built React app (apps/web/dist) so the site and the API share one
 * origin in production, exactly like the Vite proxy in development.
 */
export function webApp(dir: string): RequestHandler[] {
  const root = path.resolve(dir);
  const assets = express.static(root, {
    index: false,
    // Vite fingerprints everything under assets/, so those files never change.
    setHeaders(res, file) {
      if (file.startsWith(path.join(root, 'assets'))) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  // Client-side routes (/events/x, /admin/users…) all load index.html.
  const spa: RequestHandler = (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || /^\/api(\/|$)/.test(req.path)) return next();
    res.set('Cache-Control', 'no-cache').sendFile(path.join(root, 'index.html'));
  };
  return [assets, spa];
}
