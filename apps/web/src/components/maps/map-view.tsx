import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { LocationMapProps } from './location-map';

// Leaflet is ~40 KB gzipped; only pages that show a map download it.
const LocationMap = lazy(() => import('./location-map'));

export function MapView(props: LocationMapProps) {
  return (
    <Suspense fallback={<Skeleton className={cn('rounded-lg', props.className)} />}>
      <LocationMap {...props} />
    </Suspense>
  );
}
