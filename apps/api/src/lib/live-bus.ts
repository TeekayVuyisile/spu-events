import { EventEmitter } from 'node:events';

/**
 * Fan-out for live updates (check-in counters). The in-process version only
 * reaches clients connected to this API instance; running several instances
 * would need a shared implementation (Postgres LISTEN/NOTIFY or Redis pub/sub)
 * behind the same two methods.
 */
export interface LiveBus {
  publish(channel: string, data: unknown): void;
  /** Returns an unsubscribe function. */
  subscribe(channel: string, listener: (data: unknown) => void): () => void;
}

export function inProcessBus(): LiveBus {
  const emitter = new EventEmitter();
  // One listener per open scanner or dashboard; there's no meaningful cap.
  emitter.setMaxListeners(0);
  return {
    publish: (channel, data) => void emitter.emit(channel, data),
    subscribe(channel, listener) {
      emitter.on(channel, listener);
      return () => void emitter.off(channel, listener);
    },
  };
}
