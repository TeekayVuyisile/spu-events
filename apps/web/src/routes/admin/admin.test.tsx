import type { AdminUserDetail, Dashboard } from '@spu-events/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { delta } from '@/lib/admin-format';
import { queryClient } from '@/lib/query-client';
import { json, mockFetch, renderRoute } from '@/test/render';
import { DashboardPage } from './dashboard';
import { UserDetailPage } from './user-detail';
import { UsersPage } from './users';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('delta', () => {
  it('compares counts in percent and rates in points', () => {
    expect(delta(150, 100, 'count')).toEqual({ up: true, label: '50%' });
    expect(delta(50, 100, 'count')).toEqual({ up: false, label: '50%' });
    expect(delta(5, 0, 'count')).toEqual({ up: true, label: 'New' });
    expect(delta(0, 0, 'count')).toBeNull();
    expect(delta(0.8, 0.65, 'rate')).toEqual({ up: true, label: '15 pts' });
    expect(delta(0.5, null, 'rate')).toBeNull();
  });
});

const dashboard: Dashboard = {
  range: '30d',
  kpis: {
    revenueCents: { value: 125_000, previous: 100_000 },
    ticketsSold: { value: 42, previous: 50 },
    checkInRate: { value: null, previous: null },
    activeStudents: { value: 30, previous: 0 },
  },
  daily: [
    { date: '2030-10-10', tickets: 2, revenueCents: 10_000 },
    { date: '2030-10-11', tickets: 40, revenueCents: 115_000 },
  ],
  byCategory: [{ category: 'music', tickets: 42 }],
  topEvents: [
    {
      id: 'e1',
      title: 'Jazz Night',
      startsAt: '2030-10-24T17:00:00Z',
      capacity: 100,
      ticketsSold: 42,
      checkedIn: 0,
      revenueCents: 125_000,
    },
  ],
  attention: { openReports: 2, pendingVolunteers: 0, draftEvents: 1 },
};

describe('DashboardPage', () => {
  it('shows KPIs with changes, work waiting, and a table view of the chart', async () => {
    const fetch = mockFetch(() => json(200, { dashboard }));
    const router = renderRoute('/admin', <DashboardPage />, '/admin');

    const chip = (text: string) => (_: string, el: Element | null) => el?.textContent === text;
    expect(await screen.findByText(chip('Up 25%'))).toBeInTheDocument();
    expect(screen.getByText(chip('Down 16%'))).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 reported posts to review/ })).toHaveAttribute(
      'href',
      '/admin/moderation',
    );
    expect(screen.queryByText(/volunteer application/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jazz Night' })).toHaveAttribute(
      'href',
      '/admin/events/e1',
    );

    await userEvent.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table', { name: 'Sales per day' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('rowheader', { name: '11 Oct' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(router.state.location.search).toBe('?range=7d');
    expect(fetch.mock.calls.at(-1)![0]).toBe('/api/admin/dashboard?range=7d');
  });
});

describe('UsersPage', () => {
  it('filters by role through the URL and pages through results', async () => {
    const fetch = mockFetch(() =>
      json(200, {
        users: [
          {
            id: 'u1',
            role: 'student',
            status: 'suspended',
            firstName: 'Lerato',
            lastName: 'Mokoena',
            email: 'lerato@spu.ac.za',
            studentNumber: '202312345',
            createdAt: '2030-10-01T10:00:00Z',
          },
        ],
        total: 26,
        nextPage: 2,
      }),
    );
    const router = renderRoute('/admin/users', <UsersPage />, '/admin/users');

    const row = await screen.findByRole('link', { name: /Lerato Mokoena/ });
    expect(row).toHaveAttribute('href', '/admin/users/u1');
    expect(within(row).getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('1–1 of 26')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Gate staff' }));
    expect(router.state.location.search).toBe('?role=staff');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(router.state.location.search).toBe('?role=staff&page=2');
    expect(fetch.mock.calls.at(-1)![0]).toBe('/api/admin/users?role=staff&page=2');
  });
});

const student: AdminUserDetail = {
  id: 'u1',
  role: 'student',
  status: 'active',
  firstName: 'Lerato',
  lastName: 'Mokoena',
  email: 'lerato@spu.ac.za',
  studentNumber: '202312345',
  createdAt: '2030-10-01T10:00:00Z',
  balanceCents: 1_000,
  stats: { activeTickets: 0, attended: 0, comments: 0, reportsAgainst: 0 },
  tickets: [],
  ledger: [],
  history: [],
};

const renderUser = () => renderRoute('/admin/users/:id', <UserDetailPage />, '/admin/users/u1');

describe('UserDetailPage', () => {
  it('adjusts the wallet in cents with a reason and a request id', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch((url) =>
      url.endsWith('/wallet-adjustments')
        ? json(200, { user: { ...student, balanceCents: 3_550 } })
        : url.endsWith('/auth/me')
          ? json(200, { user: null })
          : json(200, { user: student }),
    );
    renderUser();

    await user.click(await screen.findByRole('button', { name: /Adjust wallet/ }));
    await user.type(screen.getByLabelText('Amount (R)'), '25,50');
    await user.click(screen.getByRole('button', { name: 'Add money' }));
    expect(await screen.findByText('Give a reason (at least 5 characters)')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Reason'), 'Bus trip refund');
    await user.click(screen.getByRole('button', { name: 'Add money' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/wallet-adjustments'))!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({
      direction: 'credit',
      amountCents: 2_550,
      reason: 'Bus trip refund',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(await screen.findByText(/35,50/)).toBeInTheDocument();
  });

  it('shows an overdraw error under the amount', async () => {
    const user = userEvent.setup();
    mockFetch((url) =>
      url.endsWith('/wallet-adjustments')
        ? json(409, {
            error: {
              code: 'INSUFFICIENT_FUNDS',
              message: 'The balance is R 10,00, so at most that can be taken',
              fields: { amountCents: ['More than the current balance'] },
            },
          })
        : url.endsWith('/auth/me')
          ? json(200, { user: null })
          : json(200, { user: student }),
    );
    renderUser();

    await user.click(await screen.findByRole('button', { name: /Adjust wallet/ }));
    await user.click(screen.getByRole('button', { name: 'Debit' }));
    await user.type(screen.getByLabelText('Amount (R)'), '50');
    await user.type(screen.getByLabelText('Reason'), 'Duplicate credit');
    await user.click(screen.getByRole('button', { name: 'Take money' }));

    expect(await screen.findByText(/so at most that can be taken/)).toBeInTheDocument();
    expect(screen.getByLabelText('Amount (R)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers reinstating a suspended account', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/me')
        ? json(200, { user: null })
        : json(200, { user: { ...student, status: 'suspended' } }),
    );
    renderUser();
    expect(await screen.findByRole('button', { name: /Reinstate/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suspend/ })).not.toBeInTheDocument();
  });
});
