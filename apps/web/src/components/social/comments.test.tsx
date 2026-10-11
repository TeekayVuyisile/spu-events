import type { Comment, CommentPage, EventDetail, MeResponse } from '@monthati/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meKey, queryClient } from '@/lib/query-client';
import { json, mockFetch, renderRoute } from '@/test/render';
import { CommentsSection } from './comments';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const me = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'student' as const,
  firstName: 'Lerato',
  lastName: 'Mokoena',
  email: 'lerato@spu.ac.za',
  studentNumber: '202312345',
  avatarUrl: null,
};

const event = { id: 'e1', slug: 'formal', status: 'published' } as EventDetail;

const comment = (overrides: Partial<Comment> = {}): Comment => ({
  id: 'c1',
  body: 'Who’s going?',
  author: { id: 'someone-else', name: 'Sipho D.', avatarUrl: null },
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  editedAt: null,
  deleted: false,
  reactions: [{ kind: 'fire', count: 2, mine: false }],
  replies: [],
  ...overrides,
});

function renderComments(page: CommentPage, signedIn = true) {
  queryClient.setQueryData<MeResponse>(meKey, { user: signedIn ? me : null });
  const fetch = mockFetch((url, init) => {
    if (url.includes('/reactions/')) {
      return json(200, { reactions: [{ kind: 'fire', count: 3, mine: true }] });
    }
    if (init.method === 'POST') return json(201, { comment: comment({ id: 'c2' }) });
    return json(200, page);
  });
  renderRoute('/events/:slug', <CommentsSection event={event} />, '/events/formal');
  return fetch;
}

describe('CommentsSection', () => {
  it('shows threads with author names, times and reactions', async () => {
    renderComments({
      comments: [comment({ replies: [comment({ id: 'r1', body: 'Me!', reactions: [] })] })],
      total: 2,
      nextCursor: null,
    });

    expect(await screen.findByText('Who’s going?')).toBeInTheDocument();
    expect(screen.getByText('Me!')).toBeInTheDocument();
    expect(screen.getAllByText('Sipho D.')).toHaveLength(2);
    expect(screen.getAllByText(/5 minutes ago/)).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Fire: 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reacts optimistically', async () => {
    const fetch = renderComments({ comments: [comment()], total: 1, nextCursor: null });
    await userEvent.click(await screen.findByRole('button', { name: 'Fire: 2' }));

    expect(screen.getByRole('button', { name: /Fire: 3/ })).toHaveAttribute('aria-pressed', 'true');
    expect(fetch).toHaveBeenCalledWith(
      '/api/comments/c1/reactions/fire',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('posts a comment', async () => {
    const user = userEvent.setup();
    const fetch = renderComments({ comments: [], total: 0, nextCursor: null });
    await screen.findByText(/No comments yet/);

    await user.type(screen.getByLabelText('Write a comment'), '  See you there  ');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    const post = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ body: 'See you there' });
  });

  it('asks signed-out visitors to log in and hides reaction controls', async () => {
    renderComments({ comments: [comment()], total: 1, nextCursor: null }, false);
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fevents%2Fformal',
    );
    expect(screen.queryByRole('button', { name: 'Add a reaction' })).not.toBeInTheDocument();
  });

  it('shows a deleted comment as a placeholder above its replies', async () => {
    renderComments({
      comments: [
        comment({
          deleted: true,
          body: null,
          author: null,
          reactions: [],
          replies: [comment({ id: 'r1', body: 'Still here' })],
        }),
      ],
      total: 1,
      nextCursor: null,
    });
    const placeholder = await screen.findByText('This comment was deleted.');
    expect(within(placeholder.closest('li')!).getByText('Still here')).toBeInTheDocument();
  });
});
