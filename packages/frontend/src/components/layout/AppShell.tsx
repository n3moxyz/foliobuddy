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
  History,
  MoreVertical,
} from 'lucide-react';
import { UserButton } from '@clerk/clerk-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useThemeStore, Theme } from '@/stores/themeStore';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ConnectionStatus } from '@/components/layout/ConnectionStatus';

interface AppShellProps {
  children: ReactNode;
  basePath?: string;
  demoMode?: boolean;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, shortcut: 'D' },
  { name: 'Portfolio', href: '/portfolio', icon: Wallet, shortcut: 'P' },
  { name: 'Trades', href: '/trades', icon: TrendingUp, shortcut: 'T' },
  { name: 'History', href: '/history', icon: History, shortcut: 'H' },
  { name: 'Investors', href: '/investors', icon: Users, shortcut: 'I' },
  { name: 'Settings', href: '/settings', icon: Settings, shortcut: 'S' },
];

const themeIcons: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
};

export function AppShell({ children, basePath = '', demoMode = false }: AppShellProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { currency, toggleCurrency } = useCurrencyStore();
  const { theme, cycleTheme } = useThemeStore();
  const queryClient = useQueryClient();
  const { status: wsStatus, lastUpdate } = useWebSocket();
  const ThemeIcon = themeIcons[theme];
  const buildPath = (href: string) => `${basePath}${href === '/' ? '' : href}` || '/';

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
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card border-r transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b">
          <Link to={buildPath('/')} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <svg
                aria-hidden="true"
                className="h-5 w-5 text-primary-foreground"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 15l4-5 3.5 2.5L17 5" />
                <path d="M13 5h4v4" />
              </svg>
            </div>
            <span className="font-semibold text-lg">FolioBuddy</span>
          </Link>
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const targetHref = buildPath(item.href);
            const isActive = location.pathname === targetHref;
            return (
              <Link
                key={item.name}
                to={targetHref}
                className={cn(
                  'flex items-center justify-between px-3 py-3 rounded-md text-sm transition-colors touch-manipulation',
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold border-r-2 border-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground font-medium'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </span>
                <kbd
                  className={cn(
                    'hidden lg:inline-block text-xs px-1.5 py-0.5 rounded',
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {item.shortcut}
                </kbd>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 backdrop-blur px-3 sm:h-16 sm:gap-4 sm:px-4 lg:px-6">
          <button
            className="lg:hidden p-2 -ml-2 touch-manipulation"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={toggleCurrency}
            className="font-mono h-9 min-w-[3rem] touch-manipulation"
          >
            {currency}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            aria-label={`Change theme (current: ${theme})`}
            className="h-9 w-9 touch-manipulation"
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>

          <div className="hidden sm:flex">
            <ConnectionStatus status={wsStatus} lastUpdate={lastUpdate} />
          </div>

          <Separator orientation="vertical" className="h-6 hidden sm:block" />

          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshPrices}
            disabled={refreshing}
            aria-label="Refresh prices"
            className="hidden sm:inline-flex h-9 w-9"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleExport}
            aria-label="Export data"
            className="hidden sm:inline-flex h-9 w-9"
          >
            <Download className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden h-9 w-9 touch-manipulation"
                aria-label="More actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleRefreshPrices} disabled={refreshing}>
                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                {refreshing ? 'Refreshing...' : 'Refresh Prices'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <ConnectionStatus status={wsStatus} lastUpdate={lastUpdate} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6" />

          {demoMode ? (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              aria-label="Demo user"
              title="Demo mode"
            >
              DM
            </div>
          ) : (
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: 'h-8 w-8',
                },
              }}
            />
          )}
        </header>

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
