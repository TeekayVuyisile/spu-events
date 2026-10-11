import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { CameraOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Rear camera with continuous QR decoding. `onScan` fires for every decoded
 * frame; the parent decides what to ignore (paused, duplicates).
 * Cameras need a secure context: localhost or HTTPS.
 */
export function QrCamera({ onScan }: { onScan: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onScan);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest callback without restarting the camera on every render.
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        video.current!,
        (result) => result && handler.current(result.getText()),
      )
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((err: unknown) => {
        const name = err instanceof Error ? err.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings, or enter codes by hand.'
            : window.isSecureContext
              ? 'No camera found. Enter codes by hand.'
              : 'The camera needs HTTPS. Enter codes by hand, or open the app over HTTPS.',
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  if (error) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <CameraOff className="size-12" strokeWidth={1.5} aria-hidden />
        <p className="max-w-xs">{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={video}
      muted
      playsInline
      aria-label="Camera view for scanning tickets"
      className="size-full object-cover"
    />
  );
}
