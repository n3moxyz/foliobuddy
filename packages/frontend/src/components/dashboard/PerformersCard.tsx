import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Performer } from '@/lib/api';

interface PerformersCardProps {
  title: string;
  performers: Performer[];
  type: 'top' | 'worst';
}

export function PerformersCard({ title, performers, type }: PerformersCardProps) {
  if (performers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {type === 'top' ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No positions yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {type === 'top' ? (
            <TrendingUp className="h-5 w-5 text-green-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-500" />
          )}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {performers.map((performer, index) => (
            <div
              key={performer.assetId}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-sm w-4">
                  {index + 1}.
                </span>
                <div>
                  <p className="font-medium">{performer.symbol}</p>
                  <p className="text-sm text-muted-foreground truncate max-w-[120px]">
                    {performer.name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-medium ${getPnLColorClass(performer.unrealizedPnL)}`}>
                  {formatCurrency(performer.unrealizedPnL, 'USD')}
                </p>
                <p className={`text-sm ${getPnLColorClass(performer.unrealizedPnLPct)}`}>
                  {formatPercent(performer.unrealizedPnLPct)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
