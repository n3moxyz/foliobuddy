import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useThemeStore, Theme } from '@/stores/themeStore';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Download, Camera } from 'lucide-react';

export default function Settings() {
  const queryClient = useQueryClient();
  const { currency, setCurrency } = useCurrencyStore();
  const { theme, setTheme } = useThemeStore();
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [refreshingFx, setRefreshingFx] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);

  const { data: fxRates } = useQuery({
    queryKey: ['fx', 'rates'],
    queryFn: api.getFxRates,
  });

  const { data: prices } = useQuery({
    queryKey: ['prices', 'current'],
    queryFn: api.getCurrentPrices,
  });

  const handleRefreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      await api.refreshPrices();
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Failed to refresh prices:', error);
    } finally {
      setRefreshingPrices(false);
    }
  };

  const handleRefreshFx = async () => {
    setRefreshingFx(true);
    try {
      await api.refreshFxRates();
      queryClient.invalidateQueries({ queryKey: ['fx'] });
    } catch (error) {
      console.error('Failed to refresh FX rates:', error);
    } finally {
      setRefreshingFx(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    try {
      await api.createSnapshot();
      queryClient.invalidateQueries({ queryKey: ['snapshots'] });
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const usdSgdRate = fxRates?.find(r => r.fromCcy === 'USD' && r.toCcy === 'SGD');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Configure your portfolio dashboard
        </p>
      </div>

      {/* Display Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Display Settings</CardTitle>
          <CardDescription>
            Customize how data is displayed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Default Currency</Label>
              <p className="text-sm text-muted-foreground">
                Display values in USD or SGD
              </p>
            </div>
            <Select value={currency} onValueChange={(v) => setCurrency(v as 'USD' | 'SGD')}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="SGD">SGD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {usdSgdRate && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm">
                Current USD/SGD rate: <span className="font-mono">{usdSgdRate.rate.toFixed(4)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Last updated: {formatDateTime(usdSgdRate.timestamp)}
              </p>
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Appearance</Label>
              <p className="text-sm text-muted-foreground">
                Choose your preferred theme
              </p>
            </div>
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Refresh prices and manage snapshots
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Refresh Prices</Label>
              <p className="text-sm text-muted-foreground">
                Fetch latest prices from CoinGecko ({prices?.length || 0} assets)
              </p>
            </div>
            <Button
              variant="outline"
              className="self-start sm:self-auto touch-manipulation"
              onClick={handleRefreshPrices}
              disabled={refreshingPrices}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshingPrices ? 'animate-spin' : ''}`} />
              {refreshingPrices ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Refresh FX Rates</Label>
              <p className="text-sm text-muted-foreground">
                Update USD/SGD exchange rate
              </p>
            </div>
            <Button
              variant="outline"
              className="self-start sm:self-auto touch-manipulation"
              onClick={handleRefreshFx}
              disabled={refreshingFx}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshingFx ? 'animate-spin' : ''}`} />
              {refreshingFx ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Create Snapshot</Label>
              <p className="text-sm text-muted-foreground">
                Save current portfolio state for historical tracking
              </p>
            </div>
            <Button
              variant="outline"
              className="self-start sm:self-auto touch-manipulation"
              onClick={handleCreateSnapshot}
              disabled={creatingSnapshot}
            >
              <Camera className={`h-4 w-4 mr-2`} />
              {creatingSnapshot ? 'Creating...' : 'Create Snapshot'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
          <CardDescription>
            Download your portfolio data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Full Portfolio Export</Label>
              <p className="text-sm text-muted-foreground">
                Download all data as Excel file
              </p>
            </div>
            <Button variant="outline" className="self-start sm:self-auto touch-manipulation" onClick={() => window.open(api.exportExcel(), '_blank')}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Positions CSV</Label>
              <p className="text-sm text-muted-foreground">
                Download positions as CSV
              </p>
            </div>
            <Button variant="outline" className="self-start sm:self-auto touch-manipulation" onClick={() => window.open(api.exportPositionsCsv(), '_blank')}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Trades CSV</Label>
              <p className="text-sm text-muted-foreground">
                Download trade history as CSV
              </p>
            </div>
            <Button variant="outline" className="self-start sm:self-auto touch-manipulation" onClick={() => window.open(api.exportTradesCsv(), '_blank')}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>PA Portfolio Dashboard</strong> v1.0.0</p>
            <p className="text-muted-foreground">
              A portfolio tracking application for managing crypto investments,
              trade journaling, and multi-investor support.
            </p>
            <div className="pt-4">
              <p className="text-muted-foreground">Data Sources:</p>
              <ul className="list-disc list-inside text-muted-foreground">
                <li>Prices: CoinGecko API</li>
                <li>FX Rates: CoinGecko API</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
