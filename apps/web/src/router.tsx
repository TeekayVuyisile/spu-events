import type { ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { AuthLayout } from '@/components/layout/auth-layout';
import { redirectIfSignedIn, requireUser } from '@/lib/auth';
import { DiscoverPage } from '@/routes/discover';
import { EventPage } from '@/routes/event';
import { MePage } from '@/routes/me';
import { NotFoundPage } from '@/routes/not-found';
import { PlaceholderPage } from '@/routes/placeholder';
import { BootScreen, RootLayout, RouteError } from '@/routes/route-states';
import { TicketPage } from '@/routes/ticket';
import { TicketsPage } from '@/routes/tickets';
import { WalletPage } from '@/routes/wallet';

/**
 * Code-split routes: students never download the admin area, gate page or form
 * libraries until they visit them. `page(() => import(...), 'Name')` adapts a named export.
 */
const page =
  <M,>(load: () => Promise<M>, name: keyof M) =>
  async () => ({ Component: (await load())[name] as ComponentType });

export const router = createBrowserRouter([
  {
    // Root: scroll restoration, one error page and one boot screen for every route below.
    element: <RootLayout />,
    errorElement: <RouteError />,
    HydrateFallback: BootScreen,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DiscoverPage /> },
          { path: 'events/:slug', element: <EventPage /> },
          {
            loader: requireUser(['student']),
            children: [
              { path: 'tickets', element: <TicketsPage /> },
              { path: 'tickets/:id', element: <TicketPage /> },
              { path: 'wallet', element: <WalletPage /> },
            ],
          },
          {
            loader: requireUser(),
            children: [
              { path: 'inbox', element: <PlaceholderPage title="Inbox" phase={6} /> },
              { path: 'me', element: <MePage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            loader: redirectIfSignedIn,
            lazy: page(() => import('@/routes/auth/login'), 'LoginPage'),
          },
          {
            path: 'signup',
            loader: redirectIfSignedIn,
            lazy: page(() => import('@/routes/auth/signup'), 'SignupPage'),
          },
          // Not guarded: opening an invite while signed in as someone else is allowed.
          { path: 'invite/:token', lazy: page(() => import('@/routes/auth/invite'), 'InvitePage') },
        ],
      },
      {
        path: 'admin',
        lazy: page(() => import('@/components/layout/admin-shell'), 'AdminShell'),
        loader: requireUser(['admin']),
        children: [
          { index: true, element: <PlaceholderPage title="Dashboard" phase={7} /> },
          { path: 'events', lazy: page(() => import('@/routes/admin/events'), 'AdminEventsPage') },
          {
            path: 'events/new',
            lazy: page(() => import('@/routes/admin/event-editor'), 'EventEditorPage'),
          },
          {
            path: 'events/:id',
            lazy: page(() => import('@/routes/admin/event-editor'), 'EventEditorPage'),
          },
          {
            path: 'events/:id/live',
            lazy: page(() => import('@/routes/admin/live-checkins'), 'LiveCheckinsPage'),
          },
          { path: 'staff', lazy: page(() => import('@/routes/admin/staff'), 'StaffPage') },
        ],
      },
      {
        path: 'gate',
        loader: requireUser(['staff', 'admin']),
        children: [
          { index: true, lazy: page(() => import('@/routes/gate'), 'GatePage') },
          {
            path: ':eventId',
            lazy: page(() => import('@/routes/gate-scanner'), 'GateScannerPage'),
          },
        ],
      },
    ],
  },
]);
