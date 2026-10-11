import type { Notification, NotificationPage } from '@spu-events/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportDialog } from '@/components/community/report-dialog';
import { queryClient } from '@/lib/query-client';
import { json, mockFetch, renderRoute } from '@/test/render';
import { InboxPage } from './inbox';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const note = (overrides: Partial<Notification>): Notification => ({
  id: 'n1',
  kind: 'ticket_issued',
  title: 'You’re going to Jazz Night',
  body: 'Fri 24 Oct · 19:00–23:00 · Great Hall. Your QR code is ready.',
  link: '/tickets/t1',
  read: false,
  createdAt: '2030-10-20T10:00:00.000Z',
  ...overrides,
});

describe('InboxPage', () => {
  it('shows unread notifications, opens their link and marks them read', async () => {
    const page: NotificationPage = {
      notifications: [
        note({}),
        note({
          id: 'n2',
          kind: 'event_cancelled',
          title: 'Derby Day is cancelled',
          link: null,
          read: true,
        }),
      ],
      unreadCount: 1,
      nextCursor: null,
    };
    const fetch = mockFetch((url) =>
      url.endsWith('/read') ? json(200, { unreadCount: 0 }) : json(200, page),
    );
    const router = renderRoute('/inbox', <InboxPage />, '/inbox');

    const link = await screen.findByRole('link', { name: /You’re going to Jazz Night/ });
    expect(screen.getByRole('img', { name: 'Unread' })).toBeInTheDocument();
    expect(screen.getByText('Derby Day is cancelled')).toBeInTheDocument();

    await userEvent.click(link);
    expect(router.state.location.pathname).toBe('/tickets/t1');
    const read = fetch.mock.calls.find(([url]) => String(url).endsWith('/read'))!;
    expect(JSON.parse(read[1]!.body as string)).toEqual({ ids: ['n1'] });
  });

  it('marks everything read at once', async () => {
    const fetch = mockFetch((url) =>
      url.endsWith('/read')
        ? json(200, { unreadCount: 0 })
        : json(200, { notifications: [note({})], unreadCount: 1, nextCursor: null }),
    );
    renderRoute('/inbox', <InboxPage />, '/inbox');
    await userEvent.click(await screen.findByRole('button', { name: /Mark all read/ }));
    const read = fetch.mock.calls.find(([url]) => String(url).endsWith('/read'))!;
    expect(JSON.parse(read[1]!.body as string)).toEqual({});
  });

  it('says so when there is nothing', async () => {
    mockFetch(() => json(200, { notifications: [], unreadCount: 0, nextCursor: null }));
    renderRoute('/inbox', <InboxPage />, '/inbox');
    expect(await screen.findByText('You’re all caught up')).toBeInTheDocument();
  });
});

describe('ReportDialog', () => {
  it('needs a reason, then sends the report', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch(() => json(201, { reported: true }));
    const onClose = vi.fn();
    renderRoute('/', <ReportDialog targetType="comment" targetId="c1" onClose={onClose} />, '/');

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(screen.getByText('Choose a reason')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('Spam or advertising'));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
      targetType: 'comment',
      targetId: 'c1',
      reason: 'spam',
      details: '',
    });
  });
});
