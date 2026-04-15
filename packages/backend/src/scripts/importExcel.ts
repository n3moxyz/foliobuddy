import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import type { AssetCategory, SnapshotType, StorageType } from '../lib/constants.js';

const prisma = new PrismaClient();

const DEFAULT_USER_ID = 'default-user';

// Common crypto mappings (symbol -> coingecko ID)
const COINGECKO_MAPPINGS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MKR: 'maker',
  CRV: 'curve-dao-token',
  SUSHI: 'sushi',
  COMP: 'compound-governance-token',
  SNX: 'havven',
  YFI: 'yearn-finance',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  ARB: 'arbitrum',
  OP: 'optimism',
  APT: 'aptos',
  SUI: 'sui',
  NEAR: 'near',
  ATOM: 'cosmos',
  DOT: 'polkadot',
  ADA: 'cardano',
  XRP: 'ripple',
  BNB: 'binancecoin',
  TRX: 'tron',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  XLM: 'stellar',
  ALGO: 'algorand',
  VET: 'vechain',
  FTM: 'fantom',
  MANA: 'decentraland',
  SAND: 'the-sandbox',
  AXS: 'axie-infinity',
  GALA: 'gala',
  ENJ: 'enjincoin',
  IMX: 'immutable-x',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  BUSD: 'binance-usd',
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
  if (
    upper.includes('CEX') ||
    upper.includes('BINANCE') ||
    upper.includes('COINBASE') ||
    upper.includes('KRAKEN')
  ) {
    return 'CEX';
  }
  if (
    upper.includes('DEFI') ||
    upper.includes('AAVE') ||
    upper.includes('COMPOUND') ||
    upper.includes('CURVE')
  ) {
    return 'DEFI';
  }
  if (
    upper.includes('BANK') ||
    upper.includes('FIAT') ||
    upper.includes('USD') ||
    upper.includes('SGD')
  ) {
    return 'BANK';
  }
  return 'WALLET';
}

function parseCategory(value: string): AssetCategory {
  const upper = value?.toUpperCase() ?? '';
  if (
    upper.includes('STABLE') ||
    upper.includes('USDT') ||
    upper.includes('USDC') ||
    upper.includes('DAI')
  ) {
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

function getCellValue(row: ExcelJS.Row, colIndex: number): string | number | boolean | Date | null {
  const cell = row.getCell(colIndex);
  if (cell.value === null || cell.value === undefined) return null;

  // Handle rich text
  if (typeof cell.value === 'object' && 'richText' in cell.value) {
    return (cell.value as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join('');
  }

  // Handle formula results
  if (typeof cell.value === 'object' && 'result' in cell.value) {
    const result = (cell.value as ExcelJS.CellFormulaValue).result;
    if (result instanceof Error || (typeof result === 'object' && result !== null && !(result instanceof Date))) return null;
    return result ?? null;
  }

  return cell.value as string | number | boolean | Date;
}

/** Parse a cell value as a float, returning 0 for non-numeric or null values */
function cellToFloat(value: string | number | boolean | Date | null): number {
  if (value === null || typeof value === 'boolean' || value instanceof Date) return 0;
  return parseFloat(String(value)) || 0;
}

/** Parse a cell value as a nullable float */
function cellToNullableFloat(value: string | number | boolean | Date | null): number | null {
  if (!value) return null;
  if (typeof value === 'boolean' || value instanceof Date) return null;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}

function parseDate(value: string | number | boolean | Date | null | undefined): Date | null {
  if (typeof value === 'boolean') return null;
  if (!value) return null;

  // ExcelJS automatically converts Excel dates to JavaScript Date objects
  if (value instanceof Date) {
    return value;
  }

  // Handle string dates
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Handle Excel serial date numbers (days since 1900-01-01)
  if (typeof value === 'number') {
    // Excel's epoch is January 1, 1900, but there's a leap year bug
    const excelEpoch = new Date(1899, 11, 30);
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return new Date(excelEpoch.getTime() + value * millisecondsPerDay);
  }

  return null;
}

async function importPositions(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  startRow: number,
  endRow: number
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  let count = 0;
  const errors: string[] = [];

  for (let i = startRow; i <= Math.min(endRow, sheet.rowCount); i++) {
    const row = sheet.getRow(i);
    const firstCell = getCellValue(row, 1);
    if (!firstCell) continue;

    try {
      // Assuming columns: Symbol, Name, Quantity, Avg Cost, Storage Type, Storage Location, Category
      const symbol = String(firstCell).trim();
      if (!symbol) continue;

      const name = String(getCellValue(row, 2) || symbol);
      const quantity = cellToFloat(getCellValue(row, 3));
      const avgCost = cellToFloat(getCellValue(row, 4));
      const storageTypeStr = String(getCellValue(row, 5) || 'WALLET');
      const storageLocation = getCellValue(row, 6) ? String(getCellValue(row, 6)) : null;
      const categoryStr = String(getCellValue(row, 7) || 'LIQUID_CRYPTO');

      if (quantity <= 0) continue;

      const category = parseCategory(categoryStr);
      const assetId = await getOrCreateAsset(symbol, name, category);
      const storageType = parseStorageType(storageTypeStr);

      // Create position (duplicates allowed)
      await prisma.position.create({
        data: {
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
      errors.push(`Row ${i}: ${error}`);
    }
  }

  return { count, errors };
}

async function importTrades(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  startRow: number
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  let count = 0;
  const errors: string[] = [];

  for (let i = startRow; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const firstCell = getCellValue(row, 1);
    if (!firstCell) continue;

    try {
      // Assuming columns: Asset, Direction, Entry Date, Exit Date, Entry Price, Exit Price, Quantity, Notes
      const symbol = String(firstCell).trim();
      if (!symbol) continue;

      const direction = String(getCellValue(row, 2) || 'LONG')
        .toUpperCase()
        .includes('SHORT')
        ? 'SHORT'
        : 'LONG';
      const entryDateRaw = getCellValue(row, 3);
      const exitDateRaw = getCellValue(row, 4);
      const entryPrice = cellToFloat(getCellValue(row, 5));
      const exitPrice = cellToNullableFloat(getCellValue(row, 6));
      const quantity = cellToFloat(getCellValue(row, 7));
      const notes = getCellValue(row, 8) ? String(getCellValue(row, 8)) : null;

      if (!entryPrice || !quantity) continue;

      const entryDate = parseDate(entryDateRaw);
      if (!entryDate) continue;

      const exitDate = parseDate(exitDateRaw);

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
      errors.push(`Row ${i}: ${error}`);
    }
  }

  return { count, errors };
}

async function importSnapshots(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  startRow: number,
  endRow: number,
  snapshotType: SnapshotType
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  let count = 0;
  const errors: string[] = [];

  for (let i = startRow; i <= Math.min(endRow, sheet.rowCount); i++) {
    const row = sheet.getRow(i);
    const firstCell = getCellValue(row, 1);
    if (!firstCell) continue;

    try {
      // Assuming columns: Date, Total USD, Total SGD, Monthly Return, YTD Return, BTC Outperform, ETH Outperform
      const dateRaw = firstCell;
      const totalUsd = cellToFloat(getCellValue(row, 2));
      const totalSgd = cellToNullableFloat(getCellValue(row, 3));
      const monthlyReturn = cellToNullableFloat(getCellValue(row, 4));
      const ytdReturn = cellToNullableFloat(getCellValue(row, 5));
      const btcOutperform = cellToNullableFloat(getCellValue(row, 6));
      const ethOutperform = cellToNullableFloat(getCellValue(row, 7));

      if (!totalUsd) continue;

      const timestamp = parseDate(dateRaw);
      if (!timestamp) continue;

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
      errors.push(`Row ${i}: ${error}`);
    }
  }

  return { count, errors };
}

async function importInvestors(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  startRow: number,
  endRow: number
): Promise<{ count: number; errors: string[] }> {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    return { count: 0, errors: [`Sheet '${sheetName}' not found`] };
  }

  let count = 0;
  const errors: string[] = [];

  for (let i = startRow; i <= Math.min(endRow, sheet.rowCount); i++) {
    const row = sheet.getRow(i);
    const firstCell = getCellValue(row, 1);
    if (!firstCell) continue;

    try {
      // Assuming columns: Name, Stake %, Initial Capital
      const name = String(firstCell).trim();
      if (!name) continue;

      const stakePercentage = cellToFloat(getCellValue(row, 2));
      const initialCapital = cellToFloat(getCellValue(row, 3));

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
      errors.push(`Row ${i}: ${error}`);
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

  console.log(`Importing from: ${filePath}`);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    result.errors.push(`Failed to read file: ${err}`);
    return result;
  }

  console.log(
    'Available sheets:',
    workbook.worksheets.map((ws) => ws.name)
  );

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
