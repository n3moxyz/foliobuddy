import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

type AssetCategory = 'LIQUID_CRYPTO' | 'STABLECOIN' | 'NFT' | 'ANGEL' | 'CASH';
type StorageType = 'WALLET' | 'CEX' | 'DEFI' | 'BANK';
type SnapshotType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const prisma = new PrismaClient();

const DEFAULT_USER_ID = 'default-user';

// Common crypto mappings (symbol -> coingecko ID)
const COINGECKO_MAPPINGS: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'AVAX': 'avalanche-2',
  'MATIC': 'matic-network',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'AAVE': 'aave',
  'MKR': 'maker',
  'CRV': 'curve-dao-token',
  'SUSHI': 'sushi',
  'COMP': 'compound-governance-token',
  'SNX': 'havven',
  'YFI': 'yearn-finance',
  'DOGE': 'dogecoin',
  'SHIB': 'shiba-inu',
  'PEPE': 'pepe',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'APT': 'aptos',
  'SUI': 'sui',
  'NEAR': 'near',
  'ATOM': 'cosmos',
  'DOT': 'polkadot',
  'ADA': 'cardano',
  'XRP': 'ripple',
  'BNB': 'binancecoin',
  'TRX': 'tron',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'XLM': 'stellar',
  'ALGO': 'algorand',
  'VET': 'vechain',
  'FTM': 'fantom',
  'MANA': 'decentraland',
  'SAND': 'the-sandbox',
  'AXS': 'axie-infinity',
  'GALA': 'gala',
  'ENJ': 'enjincoin',
  'IMX': 'immutable-x',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'DAI': 'dai',
  'BUSD': 'binance-usd',
};

interface ImportResult {
  assets: number;
  positions: number;
  trades: number;
  snapshots: number;
  investors: number;
  errors: string[];
}

async function ensureDefaultUser() {
  const user = await prisma.user.findUnique({
    where: { id: DEFAULT_USER_ID },
  });

  if (!user) {
    await prisma.user.create({
      data: {
        id: DEFAULT_USER_ID,
        email: 'default@portfolio.app',
        name: 'Default User',
      },
    });
    console.log('Created default user');
  }
}

async function getOrCreateAsset(
  symbol: string,
  name?: string,
  category: AssetCategory = 'LIQUID_CRYPTO'
): Promise<string> {
  const upperSymbol = symbol.toUpperCase().trim();

  // Check if exists
  let asset = await prisma.asset.findFirst({
    where: { symbol: upperSymbol },
  });

  if (asset) {
    return asset.id;
  }

  // Create new asset
  const coingeckoId = COINGECKO_MAPPINGS[upperSymbol] ?? null;

  asset = await prisma.asset.create({
    data: {
      symbol: upperSymbol,
      name: name || upperSymbol,
      category,
      coingeckoId,
    },
  });

  console.log(`Created asset: ${upperSymbol}`);
  return asset.id;
}

function parseStorageType(value: string): StorageType {
  const upper = value?.toUpperCase() ?? '';
  if (upper.includes('CEX') || upper.includes('BINANCE') || upper.includes('COINBASE') || upper.includes('KRAKEN')) {
    return 'CEX';
  }
  if (upper.includes('DEFI') || upper.includes('AAVE') || upper.includes('COMPOUND') || upper.includes('CURVE')) {
    return 'DEFI';
  }
  if (upper.includes('BANK') || upper.includes('FIAT') || upper.includes('USD') || upper.includes('SGD')) {
    return 'BANK';
  }
  return 'WALLET';
}

function parseCategory(value: string): AssetCategory {
  const upper = value?.toUpperCase() ?? '';
  if (upper.includes('STABLE') || upper.includes('USDT') || upper.includes('USDC') || upper.includes('DAI')) {
    return 'STABLECOIN';
  }
  if (upper.includes('NFT')) {
    return 'NFT';
  }
  if (upper.includes('ANGEL') || upper.includes('PRIVATE') || upper.includes('SEED')) {
    return 'ANGEL';
  }
  if (upper.includes('CASH') || upper.includes('FIAT')) {
    return 'CASH';
  }
  return 'LIQUID_CRYPTO';
}

async function importPositions(
  workbook: XLSX.WorkBook,
  sheetName: string,
  startRow: number,
  endRow: number
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  let count = 0;
  const errors: string[] = [];

  for (let i = startRow - 1; i < Math.min(endRow, data.length); i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    try {
      // Assuming columns: Symbol, Name, Quantity, Avg Cost, Storage Type, Storage Location
      const symbol = String(row[0] || '').trim();
      if (!symbol) continue;

      const name = String(row[1] || symbol);
      const quantity = parseFloat(row[2]) || 0;
      const avgCost = parseFloat(row[3]) || 0;
      const storageTypeStr = String(row[4] || 'WALLET');
      const storageLocation = row[5] ? String(row[5]) : null;
      const categoryStr = String(row[6] || 'LIQUID_CRYPTO');

      if (quantity <= 0) continue;

      const category = parseCategory(categoryStr);
      const assetId = await getOrCreateAsset(symbol, name, category);
      const storageType = parseStorageType(storageTypeStr);

      await prisma.position.upsert({
        where: {
          userId_assetId_storageType_storageLocation: {
            userId: DEFAULT_USER_ID,
            assetId,
            storageType,
            storageLocation: storageLocation ?? '',
          },
        },
        update: {
          quantity,
          avgCostUsd: avgCost,
        },
        create: {
          userId: DEFAULT_USER_ID,
          assetId,
          quantity,
          avgCostUsd: avgCost,
          storageType,
          storageLocation,
        },
      });

      count++;
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error}`);
    }
  }

  return { count, errors };
}

async function importTrades(
  workbook: XLSX.WorkBook,
  sheetName: string,
  startRow: number
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  let count = 0;
  const errors: string[] = [];

  for (let i = startRow - 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    try {
      // Assuming columns: Asset, Direction, Entry Date, Exit Date, Entry Price, Exit Price, Quantity, Notes
      const symbol = String(row[0] || '').trim();
      if (!symbol) continue;

      const direction = String(row[1] || 'LONG').toUpperCase().includes('SHORT') ? 'SHORT' : 'LONG';
      const entryDateRaw = row[2];
      const exitDateRaw = row[3];
      const entryPrice = parseFloat(row[4]) || 0;
      const exitPrice = row[5] ? parseFloat(row[5]) : null;
      const quantity = parseFloat(row[6]) || 0;
      const notes = row[7] ? String(row[7]) : null;

      if (!entryPrice || !quantity) continue;

      // Parse dates (Excel dates are numbers)
      let entryDate: Date;
      if (typeof entryDateRaw === 'number') {
        const parsedEntry = XLSX.SSF.parse_date_code(entryDateRaw);
        entryDate = new Date(parsedEntry.y, parsedEntry.m - 1, parsedEntry.d);
      } else {
        entryDate = new Date(entryDateRaw);
      }

      let exitDate: Date | null = null;
      if (exitDateRaw) {
        if (typeof exitDateRaw === 'number') {
          const parsed = XLSX.SSF.parse_date_code(exitDateRaw);
          exitDate = new Date(parsed.y, parsed.m - 1, parsed.d);
        } else {
          exitDate = new Date(exitDateRaw);
        }
      }

      const assetId = await getOrCreateAsset(symbol);

      // Calculate P&L if closed
      let realizedPnL: number | null = null;
      let realizedPnLPct: number | null = null;
      let status: 'OPEN' | 'CLOSED' = 'OPEN';

      if (exitPrice) {
        status = 'CLOSED';
        if (direction === 'LONG') {
          realizedPnL = (exitPrice - entryPrice) * quantity;
        } else {
          realizedPnL = (entryPrice - exitPrice) * quantity;
        }
        const positionSize = entryPrice * quantity;
        realizedPnLPct = positionSize > 0 ? (realizedPnL / positionSize) * 100 : 0;
      }

      await prisma.trade.create({
        data: {
          userId: DEFAULT_USER_ID,
          assetId,
          direction,
          entryPrice,
          exitPrice,
          quantity,
          positionSizeUsd: entryPrice * quantity,
          entryDate,
          exitDate,
          status,
          realizedPnL,
          realizedPnLPct,
          notes,
        },
      });

      count++;
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error}`);
    }
  }

  return { count, errors };
}

async function importSnapshots(
  workbook: XLSX.WorkBook,
  sheetName: string,
  startRow: number,
  endRow: number,
  snapshotType: SnapshotType
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  let count = 0;
  const errors: string[] = [];

  for (let i = startRow - 1; i < Math.min(endRow, data.length); i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    try {
      // Assuming columns: Date, Total USD, Total SGD, Monthly Return, YTD Return, BTC Outperform, ETH Outperform
      const dateRaw = row[0];
      const totalUsd = parseFloat(row[1]) || 0;
      const totalSgd = row[2] ? parseFloat(row[2]) : null;
      const monthlyReturn = row[3] ? parseFloat(row[3]) : null;
      const ytdReturn = row[4] ? parseFloat(row[4]) : null;
      const btcOutperform = row[5] ? parseFloat(row[5]) : null;
      const ethOutperform = row[6] ? parseFloat(row[6]) : null;

      if (!totalUsd) continue;

      let timestamp: Date;
      if (typeof dateRaw === 'number') {
        const parsed = XLSX.SSF.parse_date_code(dateRaw);
        timestamp = new Date(parsed.y, parsed.m - 1, parsed.d);
      } else {
        timestamp = new Date(dateRaw);
      }

      await prisma.snapshot.create({
        data: {
          userId: DEFAULT_USER_ID,
          timestamp,
          snapshotType,
          totalValueUsd: totalUsd,
          totalValueSgd: totalSgd,
          monthlyReturn,
          ytdReturn,
          btcOutperform,
          ethOutperform,
        },
      });

      count++;
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error}`);
    }
  }

  return { count, errors };
}

async function importInvestors(
  workbook: XLSX.WorkBook,
  sheetName: string,
  startRow: number,
  endRow: number
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  let count = 0;
  const errors: string[] = [];

  for (let i = startRow - 1; i < Math.min(endRow, data.length); i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    try {
      // Assuming columns: Name, Stake %, Initial Capital
      const name = String(row[0] || '').trim();
      if (!name) continue;

      const stakePercentage = parseFloat(row[1]) || 0;
      const initialCapital = parseFloat(row[2]) || 0;

      await prisma.investor.create({
        data: {
          userId: DEFAULT_USER_ID,
          name,
          stakePercentage,
          initialCapital,
        },
      });

      count++;
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error}`);
    }
  }

  return { count, errors };
}

async function importFromExcel(filePath: string): Promise<ImportResult> {
  const result: ImportResult = {
    assets: 0,
    positions: 0,
    trades: 0,
    snapshots: 0,
    investors: 0,
    errors: [],
  };

  if (!fs.existsSync(filePath)) {
    result.errors.push(`File not found: ${filePath}`);
    return result;
  }

  console.log(`Importing from: ${filePath}`);
  const workbook = XLSX.readFile(filePath);

  console.log('Available sheets:', workbook.SheetNames);

  await ensureDefaultUser();

  // Import positions from ET_25 sheet (rows 32-80)
  // Adjust these based on actual Excel structure
  const positionsResult = await importPositions(workbook, 'ET_25', 32, 80);
  result.positions = positionsResult.count;
  result.errors.push(...positionsResult.errors);
  console.log(`Imported ${positionsResult.count} positions`);

  // Import trades from Trading sheet (rows 18+)
  const tradesResult = await importTrades(workbook, 'Trading', 18);
  result.trades = tradesResult.count;
  result.errors.push(...tradesResult.errors);
  console.log(`Imported ${tradesResult.count} trades`);

  // Import weekly snapshots from Static sheet (rows 44-56)
  const weeklyResult = await importSnapshots(workbook, 'Static', 44, 56, 'WEEKLY');
  result.snapshots += weeklyResult.count;
  result.errors.push(...weeklyResult.errors);
  console.log(`Imported ${weeklyResult.count} weekly snapshots`);

  // Import monthly snapshots from Static sheet (rows 22-37)
  const monthlyResult = await importSnapshots(workbook, 'Static', 22, 37, 'MONTHLY');
  result.snapshots += monthlyResult.count;
  result.errors.push(...monthlyResult.errors);
  console.log(`Imported ${monthlyResult.count} monthly snapshots`);

  // Import investors from Consol sheet (rows 6-14)
  const investorsResult = await importInvestors(workbook, 'Consol', 6, 14);
  result.investors = investorsResult.count;
  result.errors.push(...investorsResult.errors);
  console.log(`Imported ${investorsResult.count} investors`);

  // Count created assets
  const assetCount = await prisma.asset.count();
  result.assets = assetCount;

  return result;
}

// Main execution
const args = process.argv.slice(2);
const filePath = args[0] || path.join(process.cwd(), 'data', 'Comb_portfolio_2025_dec.xlsx');

importFromExcel(filePath)
  .then((result) => {
    console.log('\n=== Import Complete ===');
    console.log(`Assets: ${result.assets}`);
    console.log(`Positions: ${result.positions}`);
    console.log(`Trades: ${result.trades}`);
    console.log(`Snapshots: ${result.snapshots}`);
    console.log(`Investors: ${result.investors}`);

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
    }
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
