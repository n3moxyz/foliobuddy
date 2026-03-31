import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../index.js';
import { portfolioService } from '../services/portfolioService.js';

const router = Router();

// GET /api/export/csv/positions - Export positions as CSV
router.get('/csv/positions', async (req, res, next) => {
  try {
    const positions = await prisma.position.findMany({
      where: { userId: req.userId! },
      include: { asset: true },
      orderBy: { marketValueUsd: 'desc' },
    });

    const headers = [
      'Symbol',
      'Name',
      'Category',
      'Quantity',
      'Avg Cost (USD)',
      'Current Price (USD)',
      'Market Value (USD)',
      'Unrealized P&L',
      'P&L %',
      'Storage Type',
      'Storage Location',
    ];

    const rows = positions.map((p) => [
      p.asset.symbol,
      p.asset.name,
      p.asset.category,
      p.quantity,
      p.avgCostUsd,
      p.asset.currentPriceUsd ?? '',
      p.marketValueUsd ?? '',
      p.unrealizedPnL ?? '',
      p.unrealizedPnLPct ? `${p.unrealizedPnLPct.toFixed(2)}%` : '',
      p.storageType,
      p.storageLocation ?? '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=positions.csv');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

// GET /api/export/csv/trades - Export trades as CSV
router.get('/csv/trades', async (req, res, next) => {
  try {
    const { status, from, to } = req.query;

    const where: any = { userId: req.userId! };
    if (status) where.status = status;
    if (from || to) {
      where.entryDate = {};
      if (from) where.entryDate.gte = new Date(from as string);
      if (to) where.entryDate.lte = new Date(to as string);
    }

    const trades = await prisma.trade.findMany({
      where,
      include: { asset: true },
      orderBy: { entryDate: 'desc' },
    });

    const headers = [
      'Asset',
      'Direction',
      'Status',
      'Entry Date',
      'Exit Date',
      'Entry Price',
      'Exit Price',
      'Quantity',
      'Position Size (USD)',
      'Realized P&L',
      'P&L %',
      'Notes',
    ];

    const rows = trades.map((t) => [
      t.asset.symbol,
      t.direction,
      t.status,
      t.entryDate.toISOString().split('T')[0],
      t.exitDate?.toISOString().split('T')[0] ?? '',
      t.entryPrice,
      t.exitPrice ?? '',
      t.quantity,
      t.positionSizeUsd,
      t.realizedPnL ?? '',
      t.realizedPnLPct ? `${t.realizedPnLPct.toFixed(2)}%` : '',
      t.notes ?? '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=trades.csv');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

// GET /api/export/excel - Export full portfolio as Excel
router.get('/excel', async (req, res, next) => {
  try {
    // Gather all data
    const [positions, trades, investors, snapshots, summary] = await Promise.all([
      prisma.position.findMany({
        where: { userId: req.userId! },
        include: { asset: true },
        orderBy: { marketValueUsd: 'desc' },
      }),
      prisma.trade.findMany({
        where: { userId: req.userId! },
        include: { asset: true },
        orderBy: { entryDate: 'desc' },
      }),
      prisma.investor.findMany({
        where: { userId: req.userId! },
      }),
      prisma.snapshot.findMany({
        where: { userId: req.userId! },
        orderBy: { timestamp: 'desc' },
        take: 52, // Last year of weekly snapshots
      }),
      portfolioService.getSummary(req.userId!),
    ]);

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Portfolio Dashboard';
    workbook.created = new Date();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Portfolio Summary']);
    summarySheet.addRow([]);
    summarySheet.addRow(['Total Value (USD)', summary.totalValueUsd]);
    summarySheet.addRow(['Total Value (SGD)', summary.totalValueSgd]);
    summarySheet.addRow(['Total Cost Basis', summary.totalCostBasis]);
    summarySheet.addRow(['Unrealized P&L', summary.unrealizedPnL]);
    summarySheet.addRow(['P&L %', `${summary.unrealizedPnLPct.toFixed(2)}%`]);
    summarySheet.addRow(['Position Count', summary.positionCount]);
    summarySheet.addRow(['Last Updated', summary.lastUpdated.toISOString()]);

    // Positions sheet
    const positionsSheet = workbook.addWorksheet('Positions');
    positionsSheet.columns = [
      { header: 'Symbol', key: 'symbol', width: 10 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Quantity', key: 'quantity', width: 15 },
      { header: 'Avg Cost', key: 'avgCost', width: 12 },
      { header: 'Current Price', key: 'currentPrice', width: 15 },
      { header: 'Market Value', key: 'marketValue', width: 15 },
      { header: 'Unrealized P&L', key: 'unrealizedPnL', width: 15 },
      { header: 'P&L %', key: 'pnlPct', width: 10 },
      { header: 'Storage', key: 'storage', width: 10 },
      { header: 'Location', key: 'location', width: 20 },
    ];
    positions.forEach((p) => {
      positionsSheet.addRow({
        symbol: p.asset.symbol,
        name: p.asset.name,
        category: p.asset.category,
        quantity: p.quantity,
        avgCost: p.avgCostUsd,
        currentPrice: p.asset.currentPriceUsd ?? 0,
        marketValue: p.marketValueUsd ?? 0,
        unrealizedPnL: p.unrealizedPnL ?? 0,
        pnlPct: p.unrealizedPnLPct ?? 0,
        storage: p.storageType,
        location: p.storageLocation ?? '',
      });
    });

    // Trades sheet
    const tradesSheet = workbook.addWorksheet('Trades');
    tradesSheet.columns = [
      { header: 'Asset', key: 'asset', width: 10 },
      { header: 'Direction', key: 'direction', width: 10 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Entry Date', key: 'entryDate', width: 12 },
      { header: 'Exit Date', key: 'exitDate', width: 12 },
      { header: 'Entry Price', key: 'entryPrice', width: 12 },
      { header: 'Exit Price', key: 'exitPrice', width: 12 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Position Size', key: 'positionSize', width: 15 },
      { header: 'Realized P&L', key: 'realizedPnL', width: 12 },
      { header: 'P&L %', key: 'pnlPct', width: 10 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];
    trades.forEach((t) => {
      tradesSheet.addRow({
        asset: t.asset.symbol,
        direction: t.direction,
        status: t.status,
        entryDate: t.entryDate,
        exitDate: t.exitDate ?? '',
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice ?? '',
        quantity: t.quantity,
        positionSize: t.positionSizeUsd,
        realizedPnL: t.realizedPnL ?? '',
        pnlPct: t.realizedPnLPct ?? '',
        notes: t.notes ?? '',
      });
    });

    // Investors sheet
    const investorsSheet = workbook.addWorksheet('Investors');
    investorsSheet.columns = [
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Stake %', key: 'stakePct', width: 10 },
      { header: 'Initial Capital', key: 'initialCapital', width: 15 },
      { header: 'Current Value', key: 'currentValue', width: 15 },
      { header: 'Total Return', key: 'totalReturn', width: 15 },
      { header: 'Return %', key: 'returnPct', width: 10 },
      { header: 'Join Date', key: 'joinDate', width: 12 },
    ];
    investors.forEach((i) => {
      investorsSheet.addRow({
        name: i.name,
        stakePct: i.stakePercentage,
        initialCapital: i.initialCapital,
        currentValue: i.currentValue ?? 0,
        totalReturn: i.totalReturn ?? 0,
        returnPct: i.totalReturnPct ?? 0,
        joinDate: i.joinDate,
      });
    });

    // Snapshots sheet
    const snapshotsSheet = workbook.addWorksheet('History');
    snapshotsSheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Total USD', key: 'totalUsd', width: 15 },
      { header: 'Total SGD', key: 'totalSgd', width: 15 },
      { header: 'Daily Return', key: 'dailyReturn', width: 12 },
      { header: 'Weekly Return', key: 'weeklyReturn', width: 12 },
      { header: 'Monthly Return', key: 'monthlyReturn', width: 15 },
      { header: 'YTD Return', key: 'ytdReturn', width: 12 },
      { header: 'BTC Outperform', key: 'btcOutperform', width: 15 },
      { header: 'ETH Outperform', key: 'ethOutperform', width: 15 },
    ];
    snapshots.forEach((s) => {
      snapshotsSheet.addRow({
        date: s.timestamp,
        type: s.snapshotType,
        totalUsd: s.totalValueUsd,
        totalSgd: s.totalValueSgd ?? '',
        dailyReturn: s.dailyReturn ?? '',
        weeklyReturn: s.weeklyReturn ?? '',
        monthlyReturn: s.monthlyReturn ?? '',
        ytdReturn: s.ytdReturn ?? '',
        btcOutperform: s.btcOutperform ?? '',
        ethOutperform: s.ethOutperform ?? '',
      });
    });

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=portfolio_${new Date().toISOString().split('T')[0]}.xlsx`
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
