import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initSentry, Sentry } from './lib/sentry';
import App from './App';
import { ErrorFallback } from './components/ErrorFallback';
import { AppToaster } from './components/layout/AppToaster';
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

const app = (
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, eventId }) => <ErrorFallback error={error as Error} eventId={eventId} />}
    >
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <AppToaster />
      </TooltipProvider>
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
