import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { CategoryAllocation } from '@/lib/types';

interface AllocationChartProps {
  data: CategoryAllocation[];
  title: string;
  isLoading?: boolean;
}

const COLORS = ['#BE185D', '#1D4ED8', '#059669', '#A21CAF', '#0891B2', '#854D0E'];

const CATEGORY_LABELS: Record<string, string> = {
  LIQUID_CRYPTO: 'Crypto',
  STABLECOIN: 'Stablecoins',
  NFT: 'NFTs',
  ANGEL: 'Angel/VC',
  CASH: 'Cash',
};

export function AllocationChart({ data, title, isLoading }: AllocationChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((item) => ({
    name: CATEGORY_LABELS[item.category] || item.category,
    value: item.valueUsd,
    percentage: item.percentage,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-muted-foreground">{formatCurrency(data.value, 'USD')}</p>
          <p className="text-sm text-muted-foreground">{formatNumber(data.percentage)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percentage }) => `${name}: ${formatNumber(percentage)}%`}
              labelLine={false}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 mt-4">
          {chartData.map((item, index) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm">{item.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
