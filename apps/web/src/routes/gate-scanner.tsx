import type { ScanInput, ScanResult } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Keyboard, Loader2 } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { QrCamera } from '@/components/gate/qr-camera';
import { ScanResultOverlay } from '@/components/gate/scan-result-overlay';
import { RollingNumber } from '@/components/motion/rolling-number';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api';
import { gateOverviewQuery, readGateName, useLiveGate, useScan } from '@/lib/gate';
import { NotFoundPage } from '@/routes/not-found';

/** The same QR seen again within this window is the camera re-reading it, not a new scan. */
const DUPLICATE_MS = 4000;

/** Full-screen scanner for one event. Always dark (gate-scanner.md). */
export function GateScannerPage() {
  const { eventId = '' } = useParams();
  const overview = useQuery(gateOverviewQuery(eventId));
  const { connected } = useLiveGate(eventId);
  const scan = useScan(eventId);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manual, setManual] = useState(false);
  const [gateName] = useState(readGateName);
  const busy = useRef(false);
  const last = useRef<{ text: string; at: number } | null>(null);

  const submit = useCallback(
    (input: ScanInput) => {
      if (busy.current) return;
      busy.current = true;
      scan.mutate(
        { ...input, gate: gateName || undefined },
        {
          onSuccess: setResult,
          onError: (err) =>
            setResult({
              result: 'invalid',
              message:
                err instanceof ApiRequestError
                  ? err.message
                  : 'No connection. Check the network and try again.',
              ticket: null,
              stats: overview.data?.stats ?? { checkedIn: 0, ticketsSold: 0, capacity: 0 },
            }),
          // busy stays true until the result screen is dismissed.
        },
      );
    },
    [scan, gateName, overview.data?.stats],
  );

  const onCameraScan = useCallback(
    (text: string) => {
      const now = Date.now();
      if (result || busy.current) return;
      if (last.current && last.current.text === text && now - last.current.at < DUPLICATE_MS)
        return;
      last.current = { text, at: now };
      submit({ payload: text });
    },
    [result, submit],
  );

  const dismiss = useCallback(() => {
    setResult(null);
    busy.current = false;
  }, []);

  if (overview.isError) {
    if (overview.error instanceof ApiRequestError && overview.error.status === 404)
      return <NotFoundPage />;
    return (
      <div className="dark flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <p className="text-lg">{overview.error.message}</p>
        <Button asChild variant="outline" size="lg" className="h-14">
          <Link to="/gate">Back to my events</Link>
        </Button>
      </div>
    );
  }

  const stats = overview.data?.stats;

  return (
    <div className="dark flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 p-3">
        <Button asChild variant="ghost" size="icon" className="size-14" aria-label="Exit scanner">
          <Link to="/gate">
            <ArrowLeft className="size-6!" aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold">
            {overview.data?.event.title ?? 'Loading…'}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={`size-2 rounded-full ${connected ? 'animate-pulse bg-success' : 'bg-muted-foreground'}`}
            />
            {connected ? 'Live' : 'Reconnecting…'}
            {gateName && ` · ${gateName}`}
          </p>
        </div>
        <div className="text-right" aria-live="polite">
          <p className="tabular text-2xl leading-none font-bold">
            {stats ? <RollingNumber value={stats.checkedIn} format={String} /> : '–'}
          </p>
          <p className="tabular text-xs text-muted-foreground">of {stats?.ticketsSold ?? '–'} in</p>
        </div>
      </header>

      {/* Camera with a centred square frame. */}
      <main id="main" className="relative flex-1 overflow-hidden bg-black">
        <QrCamera onScan={onCameraScan} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="aspect-square w-[min(70vw,20rem)] rounded-3xl border-4 border-white/80 shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]" />
        </div>
        {scan.isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="size-12 animate-spin text-white" aria-label="Checking ticket" />
          </div>
        )}
      </main>

      <footer className="p-3">
        <Button variant="outline" size="lg" className="h-14 w-full" onClick={() => setManual(true)}>
          <Keyboard aria-hidden /> Enter code by hand
        </Button>
      </footer>

      <ManualEntry
        open={manual}
        onClose={() => setManual(false)}
        onSubmit={(code) => {
          setManual(false);
          submit({ code });
        }}
      />

      <AnimatePresence>
        {result && <ScanResultOverlay result={result} onDismiss={dismiss} />}
      </AnimatePresence>
    </div>
  );
}

function ManualEntry({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const [value, setValue] = useState('');
  const code = `MTH-${value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
    .replace(/^(.{4})(.)/, '$1-$2')}`;
  const complete = /^MTH-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setValue('');
          onClose();
        }
      }}
    >
      {/* Portalled outside the scanner, so it needs its own `dark` to match it. */}
      <DialogContent
        title="Enter ticket code"
        description="The 8 characters under the QR code."
        className="dark text-foreground"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (complete) {
              onSubmit(code);
              setValue('');
            }
          }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2">
            <span className="tabular text-xl font-semibold text-muted-foreground">MTH-</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label="Ticket code"
              placeholder="7Q4K29XD"
              className="tabular h-14 text-xl tracking-widest uppercase"
            />
          </div>
          <p className="tabular text-center text-lg" aria-live="polite">
            {code}
          </p>
          <Button type="submit" size="lg" className="h-14 w-full" disabled={!complete}>
            Check ticket
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
