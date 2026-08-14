import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { AppShell } from './components/layout/AppShell';
import { Skeleton } from './components/ui/skeleton';
import { useAuthSetup, useLocalAuthBypassSetup } from './hooks/useAuthSetup';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from './components/layout/ShortcutsHelpModal';
import { isLocalAuthBypassEnabled } from './lib/localAuthBypass';
const Dashboard = lazy(() => import('./pages/Dashboard'));

const Portfolio = lazy(() => import('./pages/Portfolio'));
const Trades = lazy(() => import('./pages/Trades'));
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

function ClerkAuthenticatedApp() {
  useAuthSetup();
  return <AuthenticatedAppContent />;
}

function LocalAuthenticatedApp() {
  useLocalAuthBypassSetup();
  return <AuthenticatedAppContent localAuthBypass />;
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
      {DemoModeApp && (
        <Route
          path="/dev/demo/*"
          element={
            <Suspense
              fallback={
                <div className="p-6">
                  <RouteFallback />
                </div>
              }
            >
              <DemoModeApp />
            </Suspense>
          }
        />
      )}
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
