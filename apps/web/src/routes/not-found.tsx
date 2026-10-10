import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="tabular text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-bold">This page left the party</h1>
      <p className="text-muted-foreground">The link may be old or mistyped.</p>
      <Button asChild>
        <Link to="/">Back to Discover</Link>
      </Button>
    </div>
  );
}
