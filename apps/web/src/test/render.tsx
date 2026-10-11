import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { queryClient } from '@/lib/query-client';

export function json(status: number, body: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Renders `element` at `url` inside a memory router and the app's query client. */
export function renderRoute(path: string, element: ReactElement, url: string) {
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', element: <p>Landed on page</p> },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Stubs fetch with a handler and returns the mock, so tests can inspect calls. */
export function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => handler(url, init));
  vi.stubGlobal('fetch', fn);
  return fn;
}
