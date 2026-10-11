import type { LiveGateUpdate } from '@monthati/shared';
import type { RequestHandler, Response } from 'express';
import type { LiveBus } from '../../lib/live-bus';
import { liveChannel, type GateService } from './gate.service';

const scanner = (res: Response) => ({ id: res.locals.user!.id, role: res.locals.user!.role });
const eventId = (res: Response) => res.locals.valid.params.id as string;

/** Comment lines keep proxies and load balancers from closing an idle stream. */
const HEARTBEAT_MS = 25_000;

export function gateController(gate: GateService, bus: LiveBus) {
  const list: RequestHandler = async (_req, res) => {
    res.json({ events: await gate.listEvents(scanner(res)) });
  };

  const overview: RequestHandler = async (_req, res) => {
    res.json(await gate.overview(scanner(res), eventId(res)));
  };

  const scan: RequestHandler = async (_req, res) => {
    res.json(await gate.scan(scanner(res), eventId(res), res.locals.valid.body));
  };

  /**
   * Server-Sent Events: one `update` message per scan at this event. EventSource
   * reconnects by itself, so a dropped connection costs nothing but a refetch.
   */
  const live: RequestHandler = async (req, res) => {
    const id = eventId(res);
    await gate.assertAccess(scanner(res), id);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx-style proxies from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const unsubscribe = bus.subscribe(liveChannel(id), (data) => {
      res.write(`event: update\ndata: ${JSON.stringify(data as LiveGateUpdate)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };

  // ── Admin: staff assignment ──
  const listStaff: RequestHandler = async (_req, res) => {
    res.json({ staff: await gate.listStaff() });
  };
  const assignedStaff: RequestHandler = async (_req, res) => {
    res.json({ staff: await gate.assignedStaff(eventId(res)) });
  };
  const assignStaff: RequestHandler = async (_req, res) => {
    res.json({ staff: await gate.assignStaff(eventId(res), res.locals.valid.body.userIds) });
  };

  return { list, overview, scan, live, listStaff, assignedStaff, assignStaff };
}
