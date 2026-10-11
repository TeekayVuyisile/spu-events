export const NOTIFICATION_KINDS = [
  'ticket_issued',
  'ticket_refunded',
  'event_changed',
  'event_cancelled',
  'volunteer_accepted',
  'volunteer_declined',
  'report_resolved',
  'content_removed',
  'account_warning',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path to open, e.g. /tickets/<id>. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  notifications: Notification[];
  unreadCount: number;
  nextCursor: string | null;
}
