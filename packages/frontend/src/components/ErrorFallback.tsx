import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface ErrorFallbackProps {
  title?: string;
  description?: string;
  error?: Error;
  eventId?: string;
}

export function ErrorFallback({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try reloading the page.',
  error,
  eventId,
}: ErrorFallbackProps) {
  const handleReload = () => window.location.reload();

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          {/* h1: this is the entire page when the app crashes */}
          <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">{description}</p>
          {error?.message && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-xs font-mono text-muted-foreground break-all">{error.message}</p>
            </div>
          )}
          {eventId && (
            <p className="text-xs text-muted-foreground text-center">
              Error ID: <code className="font-mono">{eventId}</code>
            </p>
          )}
          <Button onClick={handleReload} className="w-full">
            Reload Page
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
