import { createBrowserRouter } from 'react-router';
import { AdminShell } from '@/components/layout/admin-shell';
import { AppShell } from '@/components/layout/app-shell';
import { AuthLayout } from '@/components/layout/auth-layout';
import { redirectIfSignedIn, requireUser } from '@/lib/auth';
import { StaffPage } from '@/routes/admin/staff';
import { InvitePage } from '@/routes/auth/invite';
import { LoginPage } from '@/routes/auth/login';
import { SignupPage } from '@/routes/auth/signup';
import { GatePage } from '@/routes/gate';
import { HomePage } from '@/routes/home';
import { MePage } from '@/routes/me';
import { NotFoundPage } from '@/routes/not-found';
import { PlaceholderPage } from '@/routes/placeholder';
import { BootScreen, RouteError } from '@/routes/route-states';

export const router = createBrowserRouter([
  {
    // Root: one error page and one boot screen for every route below.
    errorElement: <RouteError />,
    HydrateFallback: BootScreen,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          {
            loader: requireUser(['student']),
            children: [
              { path: 'tickets', element: <PlaceholderPage title="My tickets" phase={3} /> },
              { path: 'wallet', element: <PlaceholderPage title="Wallet" phase={3} /> },
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
          { path: 'login', loader: redirectIfSignedIn, element: <LoginPage /> },
          { path: 'signup', loader: redirectIfSignedIn, element: <SignupPage /> },
          // Not guarded: opening an invite while signed in as someone else is allowed.
          { path: 'invite/:token', element: <InvitePage /> },
        ],
      },
      {
        path: 'admin',
        element: <AdminShell />,
        loader: requireUser(['admin']),
        children: [
          { index: true, element: <PlaceholderPage title="Dashboard" phase={7} /> },
          { path: 'staff', element: <StaffPage /> },
        ],
      },
      { path: 'gate', loader: requireUser(['staff', 'admin']), element: <GatePage /> },
    ],
  },
]);
