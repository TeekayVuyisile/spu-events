import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { HomePage } from '@/routes/home';
import { NotFoundPage } from '@/routes/not-found';
import { PlaceholderPage } from '@/routes/placeholder';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'tickets', element: <PlaceholderPage title="My tickets" phase={3} /> },
      { path: 'wallet', element: <PlaceholderPage title="Wallet" phase={3} /> },
      { path: 'inbox', element: <PlaceholderPage title="Inbox" phase={6} /> },
      { path: 'me', element: <PlaceholderPage title="Profile" phase={1} /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
