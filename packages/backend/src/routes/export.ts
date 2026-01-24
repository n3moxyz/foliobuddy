import { Router } from 'express';
import * as XLSX from 'xlsx';
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

    const csvData = positions.map(p => ({
      Symbol: p.asset.symbol,
      Name: p.asset.name,
      Category: p.asset.category,
      Quantity: p.quantity,
      'Avg Cost (USD)': p.avgCostUsd,
      'Current Price (USD)': p.asset.currentPriceUsd ?? '',
      'Market Value (USD)': p.marketValueUsd ?? '',
      'Unrealized P&L': p.unrealizedPnL ?? '',
      'P&L %': p.unrealizedPnLPct ? `${p.unrealizedPnLPct.toFixed(2)}%` : '',
      'Storage Type': p.storageType,
      'Storage Location': p.storageLocation ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(csvData);
    const csv = XLSX.utils.sheet_to_csv(ws);

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

    const csvData = trades.map(t => ({
      Asset: t.asset.symbol,
      Direction: t.direction,
      Status: t.status,
      'Entry Date': t.entryDate.toISOString().split('T')[0],
      'Exit Date': t.exitDate?.toISOString().split('T')[0] ?? '',
      'Entry Price': t.entryPrice,
      'Exit Price': t.exitPrice ?? '',
      Quantity: t.quantity,
      'Position Size (USD)': t.positionSizeUsd,
      'Realized P&L': t.realizedPnL ?? '',
      'P&L %': t.realizedPnLPct ? `${t.realizedPnLPct.toFixed(2)}%` : '',
      Notes: t.notes ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(csvData);
    const csv = XLSX.utils.sheet_to_csv(ws);

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
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Portfolio Summary'],
      [''],
      ['Total Value (USD)', summary.totalValueUsd],
      ['Total Value (SGD)', summary.totalValueSgd],
      ['Total Cost Basis', summary.totalCostBasis],
      ['Unrealized P&L', summary.unrealizedPnL],
      ['P&L %', `${summary.unrealizedPnLPct.toFixed(2)}%`],
      ['Position Count', summary.positionCount],
      ['Last Updated', summary.lastUpdated.toISOString()],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Positions sheet
    const positionsData = positions.map(p => ({
      Symbol: p.asset.symbol,
      Name: p.asset.name,
      Category: p.asset.category,
      Quantity: p.quantity,
      'Avg Cost': p.avgCostUsd,
      'Current Price': p.asset.currentPriceUsd ?? 0,
      'Market Value': p.marketValueUsd ?? 0,
      'Unrealized P&L': p.unrealizedPnL ?? 0,
      'P&L %': p.unrealizedPnLPct ?? 0,
      Storage: p.storageType,
      Location: p.storageLocation ?? '',
    }));
    const positionsWs = XLSX.utils.json_to_sheet(positionsData);
    XLSX.utils.book_append_sheet(wb, positionsWs, 'Positions');

    // Trades sheet
    const tradesData = trades.map(t => ({
      Asset: t.asset.symbol,
      Direction: t.direction,
      Status: t.status,
      'Entry Date': t.entryDate,
      'Exit Date': t.exitDate ?? '',
      'Entry Price': t.entryPrice,
      'Exit Price': t.exitPrice ?? '',
      Quantity: t.quantity,
      'Position Size': t.positionSizeUsd,
      'Realized P&L': t.realizedPnL ?? '',
      'P&L %': t.realizedPnLPct ?? '',
      Notes: t.notes ?? '',
    }));
    const tradesWs = XLSX.utils.json_to_sheet(tradesData);
    XLSX.utils.book_append_sheet(wb, tradesWs, 'Trades');

    // Investors sheet
    const investorsData = investors.map(i => ({
      Name: i.name,
      'Stake %': i.stakePercentage,
      'Initial Capital': i.initialCapital,
      'Current Value': i.currentValue ?? 0,
      'Total Return': i.totalReturn ?? 0,
      'Return %': i.totalReturnPct ?? 0,
      'Join Date': i.joinDate,
    }));
    const investorsWs = XLSX.utils.json_to_sheet(investorsData);
    XLSX.utils.book_append_sheet(wb, investorsWs, 'Investors');

    // Snapshots sheet
    const snapshotsData = snapshots.map(s => ({
      Date: s.timestamp,
      Type: s.snapshotType,
      'Total USD': s.totalValueUsd,
      'Total SGD': s.totalValueSgd ?? '',
      'Daily Return': s.dailyReturn ?? '',
      'Weekly Return': s.weeklyReturn ?? '',
      'Monthly Return': s.monthlyReturn ?? '',
      'YTD Return': s.ytdReturn ?? '',
      'BTC Outperform': s.btcOutperform ?? '',
      'ETH Outperform': s.ethOutperform ?? '',
    }));
    const snapshotsWs = XLSX.utils.json_to_sheet(snapshotsData);
    XLSX.utils.book_append_sheet(wb, snapshotsWs, 'History');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=portfolio_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
