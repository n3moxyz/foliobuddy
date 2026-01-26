import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Users,
  Settings,
  Menu,
  X,
  RefreshCw,
  Download,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { UserButton } from '@clerk/clerk-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useThemeStore, Theme } from '@/stores/themeStore';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface AppShellProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, shortcut: 'D' },
  { name: 'Portfolio', href: '/portfolio', icon: Wallet, shortcut: 'P' },
  { name: 'Trades', href: '/trades', icon: TrendingUp, shortcut: 'T' },
  { name: 'Investors', href: '/investors', icon: Users, shortcut: 'I' },
  { name: 'Settings', href: '/settings', icon: Settings, shortcut: 'S' },
];

const themeIcons: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { currency, toggleCurrency } = useCurrencyStore();
  const { theme, cycleTheme } = useThemeStore();
  const queryClient = useQueryClient();
  const ThemeIcon = themeIcons[theme];

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    try {
      await api.refreshPrices();
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Failed to refresh prices:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = () => {
    window.open(api.exportExcel(), '_blank');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card border-r transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6 border-b">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">P</span>
            </div>
            <span className="font-semibold text-lg">PA Portfolio</span>
          </Link>
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </span>
                <kbd className={cn(
                  'hidden lg:inline-block text-xs px-1.5 py-0.5 rounded',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {item.shortcut}
                </kbd>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            PA Portfolio Dashboard v1.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur px-4 lg:px-6">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          {/* Currency toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleCurrency}
            className="font-mono"
          >
            {currency}
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* Refresh prices */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshPrices}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>

          {/* Export */}
          <Button variant="ghost" size="icon" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* User menu */}
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'h-8 w-8',
              },
            }}
          />
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
