import '@fontsource-variable/outfit';
import '@fontsource-variable/work-sans';
import '@fontsource/jetbrains-mono/500.css';
import './styles/globals.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ApiRequestError } from '@/lib/api';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry client errors (401/403/404…); they won't fix themselves.
      retry: (count, error) =>
        !(error instanceof ApiRequestError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* Respects the OS "reduce motion" setting for every motion component. */}
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} />
          <Toaster richColors position="top-center" />
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
