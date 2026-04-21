import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateAssetNav } from '@/hooks/useAssets';
import type { Asset } from '@/lib/types';

interface UpdateNavModalProps {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
}

export function UpdateNavModal({ asset, open, onClose }: UpdateNavModalProps) {
  const [nav, setNav] = useState('');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const updateNav = useUpdateAssetNav();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!asset) return;
    const navNum = parseFloat(nav);
    if (!(navNum > 0)) {
      setError('NAV must be positive');
      return;
    }

    try {
      await updateNav.mutateAsync({
        id: asset.id,
        data: {
          navPrice: navNum,
          asOfDate: new Date(asOfDate).toISOString(),
        },
      });
      setNav('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update NAV');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update NAV {asset ? `— ${asset.symbol}` : ''}</DialogTitle>
          <DialogDescription>
            {asset
              ? `Log the latest NAV in ${asset.nativeCurrency}. We'll convert to USD using the current FX rate.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="nav-price" className="text-sm">
              NAV ({asset?.nativeCurrency ?? 'USD'})
            </Label>
            <Input
              id="nav-price"
              type="number"
              step="any"
              value={nav}
              onChange={(e) => setNav(e.target.value)}
              placeholder="1.234"
              autoFocus
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nav-date" className="text-sm">
              As of
            </Label>
            <Input
              id="nav-date"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateNav.isPending}>
              {updateNav.isPending ? 'Saving...' : 'Save NAV'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
