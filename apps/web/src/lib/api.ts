import { apiErrorSchema, type ApiError } from '@monthati/shared';

/** Thrown for any non-2xx response; carries the API's structured error. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError['error'],
  ) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

/** Thin fetch wrapper: same-origin /api, cookies included, JSON in/out, typed errors. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body && !(init.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });

  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      res.status,
      parsed.success
        ? parsed.data.error
        : { code: 'NETWORK', message: 'Unexpected server response' },
    );
  }
  return body as T;
}
