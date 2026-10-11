import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/query-client';
import { LoginPage } from './login';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderLogin(url = '/login') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
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

async function fillAndSubmit(identifier: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Student number or email'), identifier);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('LoginPage', () => {
  it('validates before calling the API', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter your student number or email')).toBeInTheDocument();
    expect(screen.getByLabelText('Student number or email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the server’s message when the login is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(401, {
          error: { code: 'INVALID_CREDENTIALS', message: 'That login and password don’t match' },
        }),
      ),
    );
    renderLogin();

    await fillAndSubmit('202312345', 'wrong password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That login and password don’t match',
    );
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('returns to the page the user was sent from', async () => {
    const fetch = vi.fn(async () =>
      json(200, {
        user: {
          id: '00000000-0000-4000-8000-000000000000',
          role: 'student',
          firstName: 'Lerato',
          lastName: 'Mokoena',
          email: 'lerato@spu.ac.za',
          studentNumber: '202312345',
          avatarUrl: null,
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const router = renderLogin('/login?next=%2Fwallet');

    await fillAndSubmit('202312345', 'correct horse battery');

    expect(await screen.findByText('Landed on page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/wallet');
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
