// Centralized chart color palette.
// CSS variables keep charts aligned with light and dark themes.
const chartColor = (token: string) => `oklch(var(${token}))`;

export const BRAND_COLORS = {
  btc: chartColor('--chart-btc'),
  eth: chartColor('--chart-eth'),
} as const;

export const BRAND_FOREGROUND_COLORS = {
  btc: chartColor('--chart-btc-foreground'),
  eth: chartColor('--chart-eth-foreground'),
} as const;

export const PORTFOLIO_LINE_COLOR = chartColor('--chart-portfolio');
export const PORTFOLIO_FOREGROUND_COLOR = chartColor('--chart-portfolio-foreground');

export const ASSET_COLORS: string[] = [
  chartColor('--chart-asset-1'),
  chartColor('--chart-asset-2'),
  chartColor('--chart-asset-3'),
  chartColor('--chart-asset-4'),
  chartColor('--chart-asset-5'),
  chartColor('--chart-asset-6'),
  chartColor('--chart-asset-7'),
  chartColor('--chart-asset-8'),
  chartColor('--chart-asset-9'),
  chartColor('--chart-asset-10'),
];

export const STORAGE_COLORS: string[] = [
  chartColor('--chart-storage-1'),
  chartColor('--chart-storage-2'),
  chartColor('--chart-storage-3'),
  chartColor('--chart-storage-4'),
  chartColor('--chart-storage-5'),
];
export const STABLES_COLORS: string[] = [
  chartColor('--chart-cash-1'),
  chartColor('--chart-cash-2'),
  chartColor('--chart-cash-3'),
  chartColor('--chart-cash-4'),
  chartColor('--chart-cash-5'),
];

export const ADDITIONAL_BENCHMARK_COLORS: string[] = [
  chartColor('--chart-benchmark-1'),
  chartColor('--chart-benchmark-2'),
  chartColor('--chart-benchmark-3'),
  chartColor('--chart-benchmark-4'),
];

export const ADDITIONAL_BENCHMARK_FOREGROUND_COLORS: string[] = [
  chartColor('--chart-benchmark-1-foreground'),
  chartColor('--chart-benchmark-2-foreground'),
  chartColor('--chart-benchmark-3-foreground'),
  chartColor('--chart-benchmark-4-foreground'),
];
