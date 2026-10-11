import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/query-client';
import { json, mockFetch, renderRoute } from '@/test/render';
import { EventEditorPage } from './event-editor';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const renderNew = () => renderRoute('/admin/events/new', <EventEditorPage />, '/admin/events/new');

describe('EventEditorPage (new)', () => {
  it('shows every missing field without calling the API', async () => {
    const fetch = mockFetch(() => json(500, {}));
    renderNew();

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    for (const message of [
      'Use at least 3 characters',
      'Choose a category',
      'Where is it?',
      'Choose a start date and time',
      'Enter how many people can attend',
    ]) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends campus time as UTC and the price in cents', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch(() => json(201, { event: { id: 'e1' } }));
    const router = renderNew();

    await user.type(screen.getByLabelText('Title'), 'Spring Formal');
    await user.selectOptions(screen.getByLabelText('Category'), 'party');
    await user.type(screen.getByLabelText('Venue'), 'Great Hall');
    // datetime-local inputs take their value as one string.
    await user.type(screen.getByLabelText('Starts'), '2030-10-24T19:00');
    await user.type(screen.getByLabelText('Ends'), '2030-10-24T23:30');
    await user.clear(screen.getByLabelText('Price (R)'));
    await user.type(screen.getByLabelText('Price (R)'), '49,99');
    await user.type(screen.getByLabelText('Capacity'), '300');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/admin/events/e1'));
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/admin/events');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      title: 'Spring Formal',
      startsAt: '2030-10-24T17:00:00.000Z',
      endsAt: '2030-10-24T21:30:00.000Z',
      priceCents: 4999,
      capacity: 300,
      volunteersWanted: false,
    });
  });

  it('rejects a price that isn’t an amount', async () => {
    const user = userEvent.setup();
    mockFetch(() => json(500, {}));
    renderNew();

    await user.clear(screen.getByLabelText('Price (R)'));
    await user.type(screen.getByLabelText('Price (R)'), 'R150');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Enter a price, or 0 for free')).toBeInTheDocument();
  });
});
