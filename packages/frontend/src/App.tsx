import { useState, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { AppShell } from './components/layout/AppShell';
import { useAuthSetup } from './hooks/useAuthSetup';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from './components/layout/ShortcutsHelpModal';
const Dashboard = lazy(() => import('./pages/Dashboard'));

const Portfolio = lazy(() => import('./pages/Portfolio'));
const Trades = lazy(() => import('./pages/Trades'));
const History = lazy(() => import('./pages/History'));
const Investors = lazy(() => import('./pages/Investors'));
const Settings = lazy(() => import('./pages/Settings'));
const DemoModeApp = import.meta.env.DEV
  ? lazy(() => import('./dev/demoMode').then((module) => ({ default: module.DemoModeApp })))
  : null;

function AuthenticatedApp() {
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  useAuthSetup();
  useThemeEffect();
  useKeyboardShortcuts({
    onShowHelp: () => setShowShortcutsHelp(true),
  });

  return (
    <>
      <AppShell>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Loading...
            </div>
          }
        >
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

function App() {
  return (
    <Routes>
      {DemoModeApp && (
        <Route
          path="/dev/demo/*"
          element={
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Loading...
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
          <>
            <SignedOut>
              <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold">FolioBuddy</h1>
                    <p className="text-muted-foreground">Sign in to track your portfolio</p>
                  </div>
                  <SignIn
                    appearance={{
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
              <AuthenticatedApp />
            </SignedIn>
          </>
        }
      />
    </Routes>
  );
}

export default App;
