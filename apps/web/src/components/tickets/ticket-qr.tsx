import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The signed ticket payload as a QR code. Always dark on white, whatever the
 * theme: scanners need the contrast, and inverted codes fail on many phones.
 */
export function TicketQr({ payload, className }: { payload: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#1a1033', light: '#ffffff' },
    }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [payload]);

  return (
    <div
      role="img"
      aria-label="Ticket QR code"
      className={cn('aspect-square rounded-lg bg-white p-2 [&_svg]:size-full', className)}
      // The SVG comes from the qrcode library and encodes only our own payload.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
