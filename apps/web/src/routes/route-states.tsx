import { CircleX, Loader2 } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

/** Shown on first load while route loaders (the session check) run. */
export function BootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-live="polite">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Loading Monthati…</span>
    </div>
  );
}

/** Last-resort error page, so a crash in one screen never leaves a blank or raw stack trace. */
export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <CircleX className="mx-auto size-12 text-destructive" aria-hidden />
        <h1 className="text-3xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground">
          This screen hit an unexpected error. Reloading usually fixes it.
        </p>
        {import.meta.env.DEV && detail && (
          <p className="tabular rounded-md bg-muted p-3 text-left text-sm break-words">{detail}</p>
        )}
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}
