import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Stand-in for screens delivered in later phases. */
export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>Coming in phase {phase} of the redesign.</CardDescription>
      </CardHeader>
    </Card>
  );
}
