import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface LocationMapProps {
  lat: number;
  lng: number;
  /** Names the pin for screen readers and on hover. */
  label: string;
  /** Makes the pin draggable (and the map clickable) to fine-tune the spot. */
  onMove?: (lat: number, lng: number) => void;
  className?: string;
}

// Lucide's map-pin, filled: Leaflet's default marker images don't survive bundling.
const pinIcon = L.divIcon({
  className: 'location-pin',
  html: '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" fill="var(--primary)" stroke="var(--primary-foreground)" stroke-width="1.5"/><circle cx="12" cy="10" r="3" fill="var(--primary-foreground)"/></svg>',
  iconSize: [36, 36],
  iconAnchor: [18, 34],
});

/** About 10 cm: plenty for finding a building, without fake precision. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** OpenStreetMap tiles with one pin. Plain Leaflet; loaded lazily via `MapView`. */
export default function LocationMap({ lat, lng, label, onMove, className }: LocationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  const editable = !!onMove;

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // Build the map once; later prop changes move the pin instead of rebuilding.
  useEffect(() => {
    const m = L.map(container.current!, {
      // A map shouldn't hijack page scrolling, or one-finger scrolling on phones.
      scrollWheelZoom: false,
      dragging: editable || !L.Browser.mobile,
    }).setView([lat, lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // OSM's tile policy needs to know which site is asking; the page itself sends no referrer.
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);

    const pin = L.marker([lat, lng], {
      icon: pinIcon,
      draggable: editable,
      keyboard: editable,
      title: label,
      alt: label,
    }).addTo(m);
    const report = (at: L.LatLng) => onMoveRef.current?.(round(at.lat), round(at.lng));
    pin.on('dragend', () => report(pin.getLatLng()));
    if (editable) m.on('click', (e: L.LeafletMouseEvent) => report(e.latlng));

    // Leaflet measures its box once; re-measure when layout settles or the card resizes.
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(container.current!);

    map.current = m;
    marker.current = pin;
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the effect below follows props
  }, [editable]);

  useEffect(() => {
    marker.current?.setLatLng([lat, lng]);
    map.current?.panTo([lat, lng]);
  }, [lat, lng]);

  // z-0 makes the container a stacking context, so Leaflet's z-index 400–1000 panes stay below dialogs.
  return <div ref={container} className={cn('z-0 overflow-hidden rounded-lg', className)} />;
}
