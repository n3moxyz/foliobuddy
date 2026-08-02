import { useState, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { AppShell } from './components/layout/AppShell';
import { Skeleton } from './components/ui/skeleton';
import { useAuthSetup, useLocalAuthBypassSetup } from './hooks/useAuthSetup';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from './components/layout/ShortcutsHelpModal';
import { BrandMark } from './components/layout/BrandMark';
import { isLocalAuthBypassEnabled } from './lib/localAuthBypass';
import { useThemeStore, resolveTheme } from './stores/themeStore';
const Dashboard = lazy(() => import('./pages/Dashboard'));

const Portfolio = lazy(() => import('./pages/Portfolio'));
const Trades = lazy(() => import('./pages/Trades'));
const History = lazy(() => import('./pages/History'));
const Investors = lazy(() => import('./pages/Investors'));
const Settings = lazy(() => import('./pages/Settings'));
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

function App() {
  const localAuthBypassEnabled = isLocalAuthBypassEnabled();
  const theme = useThemeStore((state) => state.theme);

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
                <div className="min-h-screen bg-background flex items-center justify-center">
                  <div className="text-center space-y-6">
                    <div className="flex flex-col items-center gap-2">
                      <BrandMark className="mb-1 h-14 w-14" />
                      <h1 className="text-3xl font-bold">FolioBuddy</h1>
                      <p className="text-muted-foreground">Sign in to track your portfolio</p>
                    </div>
                    <SignIn
                      appearance={{
                        baseTheme: resolveTheme(theme) === 'dark' ? dark : undefined,
                        elements: {
                          rootBox: 'mx-auto',
                          card: 'shadow-sm border',
                        },
                      }}
                    />
                  </div>
                </div>
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
