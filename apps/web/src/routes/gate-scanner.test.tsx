import type { ScanResult } from '@monthati/shared';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/query-client';
import { json, mockFetch, renderRoute } from '@/test/render';
import { GateScannerPage } from './gate-scanner';

// The real camera needs getUserMedia; a button stands in for "the camera read a QR".
vi.mock('@/components/gate/qr-camera', () => ({
  QrCamera: ({ onScan }: { onScan: (text: string) => void }) => (
    <button onClick={() => onScan('MTH1.qr-payload.sig')}>fake camera scan</button>
  ),
}));

/** Minimal EventSource that lets a test push a server event. */
class FakeEventSource {
  static last: FakeEventSource;
  listeners = new Map<string, (e: MessageEvent) => void>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.last = this;
    queueMicrotask(() => this.onopen?.());
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, fn);
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  close() {}
}

const EVENT_ID = '00000000-0000-4000-8000-0000000000e1';
const stats = (checkedIn: number) => ({ checkedIn, ticketsSold: 120, capacity: 300 });
const overview = {
  event: { id: EVENT_ID, title: 'Spring Formal', checkedIn: 41 },
  stats: stats(41),
  recent: [],
};

const admitted: ScanResult = {
  result: 'admitted',
  message: 'Admit',
  stats: stats(42),
  ticket: {
    code: 'MTH-7Q4K-29XD',
    holderName: 'Lerato Mokoena',
    holderAvatarUrl: null,
    checkedInAt: '2030-10-24T17:42:00.000Z',
    checkedInBy: 'Sipho Dlamini',
    gate: null,
  },
};

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('navigator', { ...navigator, vibrate: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  queryClient.clear();
});

function renderScanner(onScan: (body: Record<string, string>) => ScanResult = () => admitted) {
  const fetch = mockFetch((url, init) =>
    url.endsWith('/scan')
      ? json(200, onScan(JSON.parse(init.body as string)))
      : json(200, overview),
  );
  renderRoute('/gate/:eventId', <GateScannerPage />, `/gate/${EVENT_ID}`);
  return fetch;
}

describe('GateScannerPage', () => {
  it('shows the result full screen and buzzes', async () => {
    renderScanner();
    await userEvent.click(await screen.findByRole('button', { name: 'fake camera scan' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Admit');
    expect(alert).toHaveTextContent('Lerato Mokoena');
    expect(navigator.vibrate).toHaveBeenCalledWith([60]);
  });

  it('ignores the camera re-reading the same QR', async () => {
    const fetch = renderScanner();
    const camera = await screen.findByRole('button', { name: 'fake camera scan' });
    await userEvent.click(camera);
    await userEvent.click(
      await screen.findByRole('button', { name: /Tap to scan the next ticket/ }),
    );
    await userEvent.click(camera);

    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/scan'))).toHaveLength(1);
  });

  it('checks a code typed by hand', async () => {
    const user = userEvent.setup();
    const fetch = renderScanner(() => ({
      ...admitted,
      result: 'already_used',
      message: 'Already scanned at 19:42 by Gate B',
    }));

    await user.click(await screen.findByRole('button', { name: /Enter code by hand/ }));
    await user.type(screen.getByLabelText('Ticket code'), '7q4k29xd');
    await user.click(screen.getByRole('button', { name: 'Check ticket' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Already scanned at 19:42 by Gate B',
    );
    const scanCall = fetch.mock.calls.find(([url]) => String(url).endsWith('/scan'))!;
    expect(JSON.parse(scanCall[1]!.body as string)).toMatchObject({ code: 'MTH-7Q4K-29XD' });
  });

  it('updates the live counter from the stream', async () => {
    renderScanner();
    await screen.findByText('Spring Formal');
    expect(screen.getByText('of 120 in')).toBeInTheDocument();

    act(() => FakeEventSource.last.emit('update', { stats: stats(57), scan: { id: 's1' } }));
    expect(await screen.findByText('57', { selector: '.sr-only' })).toBeInTheDocument();
  });
});
