import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Trades from './pages/Trades';
import Investors from './pages/Investors';
import Settings from './pages/Settings';

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/trades" element={<Trades />} />
        <Route path="/investors" element={<Investors />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}

export default App;
