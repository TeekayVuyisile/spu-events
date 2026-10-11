import { QueryCache, QueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@spu-events/shared';
import { ApiRequestError } from '@/lib/api';

export const meKey = ['me'] as const;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // A 401 anywhere means the session ended server-side; reflect that in the UI.
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        queryClient.setQueryData<MeResponse>(meKey, { user: null });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry client errors (401/403/404…); they won't fix themselves.
      retry: (count, error) =>
        !(error instanceof ApiRequestError && error.status < 500) && count < 2,
    },
  },
});
