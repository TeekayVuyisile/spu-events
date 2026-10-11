import type { Notification, NotificationPage } from '@spu-events/shared';
import type { Db } from '../../db/client';
import { decodeCursor, encodeCursor } from '../../lib/cursor';
import { notificationsRepository } from './notifications.repository';

const PAGE_SIZE = 30;

export function notificationsService({ db }: { db: Db }) {
  const repo = notificationsRepository(db);

  return {
    async list(userId: string, cursor?: string): Promise<NotificationPage> {
      const rows = await repo.list(userId, decodeCursor(cursor), PAGE_SIZE);
      const page = rows.slice(0, PAGE_SIZE);
      const last = page.at(-1);
      return {
        notifications: page.map(({ row }): Notification => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          link: row.link,
          read: row.readAt !== null,
          createdAt: row.createdAt.toISOString(),
        })),
        unreadCount: await repo.unreadCount(userId),
        nextCursor:
          rows.length > PAGE_SIZE && last ? encodeCursor(last.cursorTs, last.row.id) : null,
      };
    },

    unreadCount: (userId: string) => repo.unreadCount(userId),

    async markRead(userId: string, ids?: string[]) {
      await repo.markRead(userId, ids);
      return { unreadCount: await repo.unreadCount(userId) };
    },
  };
}

export type NotificationsService = ReturnType<typeof notificationsService>;
