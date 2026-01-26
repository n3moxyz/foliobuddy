import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface ErrorFallbackProps {
  error?: Error;
  eventId?: string;
  resetError?: () => void;
}

export function ErrorFallback({ error, eventId, resetError }: ErrorFallbackProps) {
  const handleReload = () => {
    if (resetError) {
      resetError();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            An unexpected error occurred. Please try reloading the page.
          </p>
          {error?.message && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-xs font-mono text-muted-foreground break-all">
                {error.message}
              </p>
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
    </div>
  );
}
