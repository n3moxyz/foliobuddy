import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import {
  SignedIn,
  SignedOut,
  SignIn,
} from '@clerk/clerk-react';
import { AppShell } from './components/layout/AppShell';
import { useAuthSetup } from './hooks/useAuthSetup';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from './components/layout/ShortcutsHelpModal';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Trades from './pages/Trades';
import History from './pages/History';
import Investors from './pages/Investors';
import Settings from './pages/Settings';

// Component to set up auth and render children
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
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/history" element={<History />} />
          <Route path="/investors" element={<Investors />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AppShell>
      <ShortcutsHelpModal
        open={showShortcutsHelp}
        onOpenChange={setShowShortcutsHelp}
      />
    </>
  );
}

function App() {
  return (
    <>
      {/* Show sign-in when not authenticated */}
      <SignedOut>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">PA Portfolio Dashboard</h1>
              <p className="text-muted-foreground">
                Sign in to track your portfolio
              </p>
            </div>
            <SignIn
              appearance={{
                elements: {
                  rootBox: 'mx-auto',
                  card: 'shadow-lg',
                },
              }}
            />
          </div>
        </div>
      </SignedOut>

      {/* Show app when authenticated */}
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
    </>
  );
}

export default App;
