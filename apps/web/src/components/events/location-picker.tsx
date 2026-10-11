import { CAMPUS_CENTER, type EventLocation, type PlaceSuggestion } from '@spu-events/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Loader2, MapPin, MapPinOff, Search } from 'lucide-react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { MapView } from '@/components/maps/map-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { placesQuery } from '@/lib/maps';
import { cn } from '@/lib/utils';

const CAMPUS_PIN: EventLocation = {
  ...CAMPUS_CENTER,
  address: 'Sol Plaatje University (Central Campus), Bultfontein Road, Kimberley',
};

/**
 * Pins an event on the map: search a place (suggestions as you type), then drag the
 * pin, or click the map, onto the exact building. OpenStreetMap rarely knows campus
 * rooms, so the search gets close and the pin does the rest.
 */
export function LocationPicker({
  value,
  onChange,
  onPick,
  error,
  disabled,
}: {
  value: EventLocation | null;
  onChange: (location: EventLocation | null) => void;
  /** Called with the chosen suggestion, e.g. to fill an empty venue name. */
  onPick?: (place: PlaceSuggestion) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Ask once typing pauses, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const search = useQuery({ ...placesQuery(q), enabled: q.length >= 3 });
  const places = q.length >= 3 ? (search.data ?? []) : [];
  const showList = open && q.length >= 3 && !search.isPending;

  function pick(place: PlaceSuggestion) {
    onChange({
      lat: place.lat,
      lng: place.lng,
      address: [place.name, place.address].filter(Boolean).join(', ').slice(0, 200),
    });
    onPick?.(place);
    setText('');
    setQ('');
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (!places.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + places.length) % places.length);
    } else if (e.key === 'Enter') {
      // Never submit the event form from the search box.
      e.preventDefault();
      const place = places[active] ?? places[0];
      if (open && place) pick(place);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const listId = `${id}-places`;
  const status = search.isError
    ? search.error.message
    : showList
      ? places.length
        ? `${places.length} place${places.length === 1 ? '' : 's'} found`
        : 'No places found. Try a street, suburb or landmark.'
      : '';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          {value ? 'Search for a different place' : 'Search for a place'}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList && places.length > 0}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-describedby={`${id}-status`}
            aria-invalid={!!error}
            autoComplete="off"
            value={text}
            disabled={disabled}
            placeholder="Sol Plaatje University, Bultfontein Road…"
            className="pr-9 pl-9"
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          {search.isFetching && (
            <Loader2
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
          {showList && places.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Places"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
            >
              {places.map((place, i) => (
                <li
                  key={place.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown would blur the input first and close the list before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(place)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-start gap-2.5 rounded px-2.5 py-2',
                    i === active && 'bg-accent',
                  )}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{place.name}</span>
                    {place.address && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {place.address}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p
          id={`${id}-status`}
          aria-live="polite"
          className={cn(
            'text-sm',
            search.isError ? 'flex items-start gap-1.5 text-destructive' : 'text-muted-foreground',
            !status && 'sr-only',
          )}
        >
          {search.isError && <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {status || 'Type at least 3 characters to see suggestions.'}
        </p>
      </div>

      {value ? (
        <div className="space-y-3">
          <MapView
            lat={value.lat}
            lng={value.lng}
            label="Event location"
            onMove={(lat, lng) => onChange({ ...value, lat, lng })}
            className="h-64 w-full border"
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="min-w-0 text-sm">
              <span className="block font-medium break-words">{value.address}</span>
              <span className="text-muted-foreground">
                Drag the pin, or click the map, to mark the exact building.
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              <MapPinOff aria-hidden /> Remove pin
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            No pin yet. Students will see the venue name only.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(CAMPUS_PIN)}
          >
            <MapPin aria-hidden /> Drop a pin on campus
          </Button>
        </div>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
