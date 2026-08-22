import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useThemeStore } from '@/stores/themeStore';
import { initSentry, Sentry } from './lib/sentry';
import App from './App';
import { ErrorFallback } from './components/ErrorFallback';
import { isLocalAuthBypassEnabled } from './lib/localAuthBypass';
import { installViteChunkRecovery } from './lib/chunkRecovery';
import './index.css';

installViteChunkRecovery();
initSentry();

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const localAuthBypassEnabled = isLocalAuthBypassEnabled();

if (!CLERK_PUBLISHABLE_KEY && !localAuthBypassEnabled) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  // Global safety net: no mutation failure is ever silent (deletes with
  // optimistic rollback, saves, refreshes). Forms may also show inline errors.
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error('Action failed', {
        description:
          error instanceof Error ? error.message : 'Check your connection and try again.',
      });
    },
  }),
});

function AppToaster() {
  // Pass the raw preference through: Sonner resolves 'system' itself and keeps its own
  // prefers-color-scheme listener, so OS appearance changes re-theme toasts live.
  // Resolving here would freeze the toaster on whatever the OS was at first render.
  const theme = useThemeStore((state) => state.theme);
  // pointer-events-auto: Radix modal dialogs set body { pointer-events: none } while open,
  // which would otherwise make toasts (hover-to-pause, swipe, the close button) inert.
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      richColors
      className="pointer-events-auto"
    />
  );
}

const app = (
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, eventId }) => <ErrorFallback error={error as Error} eventId={eventId} />}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <AppToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  localAuthBypassEnabled ? (
    app
  ) : (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>{app}</ClerkProvider>
  )
);
