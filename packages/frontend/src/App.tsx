import { useState, lazy, Suspense, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { AppShell } from './components/layout/AppShell';
import { Skeleton } from './components/ui/skeleton';
import { useAuthSetup, useLocalAuthBypassSetup } from './hooks/useAuthSetup';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from './components/layout/ShortcutsHelpModal';
import { isLocalAuthBypassEnabled } from './lib/localAuthBypass';
import { createSessionQueryClient } from './lib/queryClient';
import type { AuthSession } from './lib/authSession';
const Dashboard = lazy(() => import('./pages/Dashboard'));

const Portfolio = lazy(() => import('./pages/Portfolio'));
const Trades = lazy(() => import('./pages/Trades'));
const News = lazy(() => import('./pages/News'));
const History = lazy(() => import('./pages/History'));
const Investors = lazy(() => import('./pages/Investors'));
const Settings = lazy(() => import('./pages/Settings'));
const Landing = lazy(() => import('./pages/Landing'));
const SignInPage = lazy(() => import('./pages/SignInPage'));
const DemoModeApp = import.meta.env.DEV
  ? lazy(() => import('./dev/demoMode').then((module) => ({ default: module.DemoModeApp })))
  : null;

// Route-chunk fallback: skeleton (matching page loading states) + SR announcement.
function RouteFallback() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading page…</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function AuthenticatedAppContent({ localAuthBypass = false }: { localAuthBypass?: boolean }) {
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  useThemeEffect();
  useKeyboardShortcuts({
    onShowHelp: () => setShowShortcutsHelp(true),
  });

  return (
    <>
      <AppShell localAuthBypass={localAuthBypass}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/news" element={<News />} />
            <Route path="/history" element={<History />} />
            <Route path="/investors" element={<Investors />} />
            <Route path="/settings" element={<Settings />} />
            {/* Fresh sign-ins land on /sign-in; bounce them into the app. */}
            <Route path="/sign-in" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
      <ShortcutsHelpModal open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp} />
    </>
  );
}

function SessionQueries({ session, children }: { session: AuthSession; children: ReactNode }) {
  const [client] = useState(() => createSessionQueryClient(session));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ClerkAuthenticatedApp() {
  const session = useAuthSetup();
  if (!session) return <RouteFallback />;
  return (
    <SessionQueries key={session.generation} session={session}>
      <AuthenticatedAppContent />
    </SessionQueries>
  );
}

function LocalAuthenticatedApp() {
  const session = useLocalAuthBypassSetup();
  if (!session) return <RouteFallback />;
  return (
    <SessionQueries key={session.generation} session={session}>
      <AuthenticatedAppContent localAuthBypass />
    </SessionQueries>
  );
}

function LocalDemoApp() {
  const session = useLocalAuthBypassSetup('demo-user');
  if (!session || !DemoModeApp) return <RouteFallback />;
  return (
    <SessionQueries key={session.generation} session={session}>
      <Suspense fallback={<RouteFallback />}>
        <DemoModeApp />
      </Suspense>
    </SessionQueries>
  );
}

// Signed-out surface: the public landing at /, Clerk sign-in everywhere else
// (deep links from returning users go straight to sign-in, not marketing).
function PublicApp() {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-screen items-center justify-center bg-background"
        >
          <span className="sr-only">Loading page…</span>
          <Skeleton className="h-8 w-40" />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<SignInPage />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const localAuthBypassEnabled = isLocalAuthBypassEnabled();

  return (
    <Routes>
      {DemoModeApp && <Route path="/dev/demo/*" element={<LocalDemoApp />} />}
      <Route
        path="/*"
        element={
          localAuthBypassEnabled ? (
            <LocalAuthenticatedApp />
          ) : (
            <>
              <SignedOut>
                <PublicApp />
              </SignedOut>

              <SignedIn>
                <ClerkAuthenticatedApp />
              </SignedIn>
            </>
          )
        }
      />
    </Routes>
  );
}

export default App;
