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
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Download,
  Sun,
  Moon,
  Monitor,
  History,
  MoreVertical,
  Eye,
  EyeOff,
} from 'lucide-react';
import { UserButton } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { toast } from 'sonner';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useThemeStore, resolveTheme, Theme } from '@/stores/themeStore';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import {
  useWebSocket,
  type ConnectionStatus as WebSocketConnectionStatus,
} from '@/hooks/useWebSocket';
import { ConnectionStatus } from '@/components/layout/ConnectionStatus';
import { BrandMark } from '@/components/layout/BrandMark';
import { usePrivacyStore } from '@/stores/privacyStore';

interface AppShellProps {
  children: ReactNode;
  basePath?: string;
  demoMode?: boolean;
  localAuthBypass?: boolean;
}

interface AppShellContentProps extends AppShellProps {
  wsStatus: WebSocketConnectionStatus;
  lastUpdate: Date | null;
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
  system: Monitor,
};

const SIDEBAR_COLLAPSED_KEY = 'foliobuddy-sidebar-collapsed';

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
}

export function AppShell(props: AppShellProps) {
  if (props.demoMode || props.localAuthBypass) {
    return <AppShellContent {...props} wsStatus="disconnected" lastUpdate={null} />;
  }

  return <AppShellWithWebSocket {...props} />;
}

function AppShellWithWebSocket(props: AppShellProps) {
  const { status: wsStatus, lastUpdate } = useWebSocket();
  return <AppShellContent {...props} wsStatus={wsStatus} lastUpdate={lastUpdate} />;
}

function AppShellContent({
  children,
  basePath = '',
  demoMode = false,
  localAuthBypass = false,
  wsStatus,
  lastUpdate,
}: AppShellContentProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [refreshing, setRefreshing] = useState(false);
  const { currency, toggleCurrency } = useCurrencyStore();
  const { theme, cycleTheme } = useThemeStore();
  const { valuesHidden, toggleValuesHidden } = usePrivacyStore();
  const queryClient = useQueryClient();
  const ThemeIcon = themeIcons[theme];
  const buildPath = (href: string) => `${basePath}${href === '/' ? '' : href}` || '/';
  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    try {
      await api.refreshPrices();
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
      toast.success('Prices refreshed');
    } catch (error) {
      console.error('Failed to refresh prices:', error);
      toast.error('Price refresh failed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = () => {
    window.open(api.exportExcel(), '_blank');
  };

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card border-r transition-[transform,width] duration-200 ease-out lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center justify-between px-6 border-b',
            sidebarCollapsed && 'lg:justify-center lg:px-0'
          )}
        >
          <Link
            to={buildPath('/')}
            className={cn(
              'flex min-w-0 items-center gap-2',
              sidebarCollapsed && 'lg:justify-center'
            )}
            aria-label="FolioBuddy dashboard"
          >
            <BrandMark className="h-8 w-8" />
            <span className={cn('font-semibold text-lg', sidebarCollapsed && 'lg:hidden')}>
              FolioBuddy
            </span>
          </Link>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-md lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <TooltipProvider delayDuration={150}>
          <nav
            aria-label="Main"
            className={cn('flex-1 p-4 space-y-1', sidebarCollapsed && 'lg:px-3')}
          >
            {navigation.map((item) => {
              const targetHref = buildPath(item.href);
              const isActive = location.pathname === targetHref;
              const link = (
                <Link
                  key={item.name}
                  to={targetHref}
                  className={cn(
                    'flex items-center justify-between rounded-md border border-transparent px-3 py-3 text-sm transition-colors touch-manipulation',
                    sidebarCollapsed && 'lg:h-11 lg:justify-center lg:px-0',
                    isActive
                      ? 'border-primary/30 bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground font-medium'
                  )}
                  onClick={() => setSidebarOpen(false)}
                  aria-label={sidebarCollapsed ? item.name : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className={cn('truncate', sidebarCollapsed && 'lg:hidden')}>
                      {item.name}
                    </span>
                  </span>
                  <kbd
                    aria-hidden="true"
                    className={cn(
                      'hidden lg:inline-block text-xs px-1.5 py-0.5 rounded',
                      sidebarCollapsed && 'lg:hidden',
                      isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {item.shortcut}
                  </kbd>
                </Link>
              );

              return sidebarCollapsed ? (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="hidden lg:block">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </nav>
        </TooltipProvider>
      </aside>

      <div
        className={cn(
          'transition-[padding] duration-200 ease-out',
          sidebarCollapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64'
        )}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 sm:h-16 sm:gap-4 sm:px-4 lg:px-6">
          <button
            className="-ml-3 flex h-11 w-11 items-center justify-center rounded-md touch-manipulation lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand navigation panel' : 'Collapse navigation panel'}
            title={sidebarCollapsed ? 'Expand navigation panel' : 'Collapse navigation panel'}
            className="hidden h-11 w-11 -ml-3 touch-manipulation lg:inline-flex"
          >
            <SidebarToggleIcon className="h-4 w-4" />
          </Button>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={toggleCurrency}
            className="h-11 min-w-[3.25rem] font-mono touch-manipulation"
          >
            {currency}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleValuesHidden}
            title={valuesHidden ? 'Show monetary values' : 'Hide monetary values'}
            aria-label={valuesHidden ? 'Show monetary values' : 'Hide monetary values'}
            aria-pressed={valuesHidden}
            className="h-11 w-11 touch-manipulation"
          >
            {valuesHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            aria-label={`Change theme (current: ${theme})`}
            className="h-11 w-11 touch-manipulation"
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
            className="hidden h-11 w-11 sm:inline-flex"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
          <span className="sr-only" role="status" aria-live="polite">
            {refreshing ? 'Refreshing prices' : ''}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleExport}
            aria-label="Export data"
            className="hidden h-11 w-11 sm:inline-flex"
          >
            <Download className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 touch-manipulation sm:hidden"
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

          {demoMode || localAuthBypass ? (
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              aria-label={demoMode ? 'Demo user' : 'Local user'}
              title={demoMode ? 'Demo mode' : 'Local auth bypass'}
            >
              {demoMode ? 'DM' : 'LB'}
            </div>
          ) : (
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                baseTheme: resolveTheme(theme) === 'dark' ? dark : undefined,
                elements: {
                  avatarBox: 'h-11 w-11',
                },
              }}
            />
          )}
        </header>

        <main id="main-content" tabIndex={-1} className="p-4 outline-none lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
