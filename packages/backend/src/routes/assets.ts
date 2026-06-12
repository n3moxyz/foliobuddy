import express, { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ASSET_CATEGORIES,
  AssetCategory,
  PriceProvider,
  USD_SGD_FALLBACK_RATE,
} from '../lib/constants.js';
import { externalProviderCategoryError } from '../lib/domain.js';
import { requireAdminUser, requireUserHoldsAsset } from '../lib/authorization.js';
import type { ProviderName } from '../services/providers/types.js';
import { parseUobKhStatement } from '../services/statementParsers/uobKayHian.js';
import { parseFsmOneStatement } from '../services/statementParsers/fsmOne.js';
import { logger } from '../lib/logger.js';

async function navToUsd(
  navPrice: number,
  nativeCurrency: string
): Promise<{ priceUsd: number; fxRateToUsd: number | null }> {
  const ccy = nativeCurrency.toUpperCase();
  if (ccy === 'USD') return { priceUsd: navPrice, fxRateToUsd: null };
  if (ccy === 'SGD') {
    const row = await prisma.fxRate.findUnique({
      where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
    });
    const rate = row?.rate ?? USD_SGD_FALLBACK_RATE;
    return { priceUsd: navPrice / rate, fxRateToUsd: 1 / rate };
  }
  throw new AppError(`Unsupported native currency ${ccy}. Only USD and SGD are supported.`, 400);
}

function slugifyUtId(symbol: string, isin?: string | null): string {
  if (isin && isin.trim()) return isin.trim().toUpperCase();
  return `ut-${symbol
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
}

const router = Router();

const createAssetSchema = z.object({
  coingeckoId: z.string().optional(),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES).default(AssetCategory.LIQUID_CRYPTO),
  priceProvider: z.enum(['coingecko', 'yahoo', 'manual']).optional(),
  providerAssetId: z.string().nullable().optional(),
  nativeCurrency: z.string().optional(),
  exchange: z.string().nullable().optional(),
  currentPriceUsd: z.number().nonnegative().optional(),
});

const updateAssetSchema = createAssetSchema.omit({ currentPriceUsd: true }).partial();

const PROVIDER_FOR_CATEGORY: Record<string, ProviderName> = {
  EQUITY: 'yahoo',
  UNIT_TRUST: 'manual',
  LIQUID_CRYPTO: 'coingecko',
  STABLECOIN: 'coingecko',
  CASH: 'coingecko',
  NFT: 'coingecko',
  ANGEL: 'coingecko',
};

function providerForCategory(category?: string | null): ProviderName {
  if (!category) return 'coingecko';
  return PROVIDER_FOR_CATEGORY[category] ?? 'coingecko';
}

router.get('/', async (req, res, next) => {
  try {
    const { category, search } = req.query;

    const where: Prisma.AssetWhereInput = {
      ...(category ? { category: category as string } : {}),
      ...(search
        ? {
            OR: [
              { symbol: { contains: search as string } },
              { name: { contains: search as string } },
            ],
          }
        : {}),
    };

    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ symbol: 'asc' }],
      take: 500,
    });

    res.json(assets);
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { q, category, provider: providerParam } = req.query;

    if (!q || typeof q !== 'string') {
      throw new AppError('Search query is required', 400);
    }

    const providerName: ProviderName =
      (providerParam as ProviderName | undefined) ??
      providerForCategory(category as string | undefined);

    const results = await priceService.searchAssets(q, providerName);

    // Response shape is backwards-compatible with the legacy CoinGecko-only
    // callers: they read `id`, `symbol`, `name`. New callers get the richer
    // fields (providerAssetId, exchange, nativeCurrency, provider).
    res.json(
      results.map((r) => ({
        id: r.providerAssetId,
        providerAssetId: r.providerAssetId,
        provider: providerName,
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange ?? null,
        nativeCurrency: r.nativeCurrency ?? null,
        rank: r.rank ?? null,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        positions: {
          where: { userId: req.userId! },
        },
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 30,
        },
      },
    });

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    res.json(asset);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = createAssetSchema.parse(req.body);

    const existing = await prisma.asset.findFirst({
      where: { symbol: data.symbol.toUpperCase() },
    });

    if (existing) {
      throw new AppError(`Asset with symbol ${data.symbol} already exists`, 409);
    }

    let currentPriceUsd: number | null = data.currentPriceUsd ?? null;
    if (currentPriceUsd === null && data.coingeckoId) {
      currentPriceUsd = await priceService.getDirectPrice(data.coingeckoId);
    }

    const asset = await prisma.asset.create({
      data: {
        coingeckoId: data.coingeckoId,
        priceProvider: data.priceProvider,
        providerAssetId: data.providerAssetId,
        nativeCurrency: data.nativeCurrency,
        exchange: data.exchange,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        category: data.category,
        currentPriceUsd,
        priceUpdatedAt: currentPriceUsd !== null ? new Date() : null,
      },
    });

    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

router.post('/from-coingecko', async (req, res, next) => {
  try {
    const { coingeckoId, symbol, name, category, skipPriceFetch } = req.body;

    if (!coingeckoId || !symbol || !name) {
      throw new AppError('coingeckoId, symbol, and name are required', 400);
    }

    const existing = await prisma.asset.findFirst({
      where: {
        OR: [{ coingeckoId }, { symbol: symbol.toUpperCase() }],
      },
    });

    if (existing) {
      return res.json(existing);
    }

    let currentPriceUsd = null;
    if (!skipPriceFetch) {
      currentPriceUsd = await priceService.getDirectPrice(coingeckoId);
    }

    const asset = await prisma.asset.create({
      data: {
        coingeckoId,
        priceProvider: PriceProvider.COINGECKO,
        providerAssetId: coingeckoId,
        nativeCurrency: 'USD',
        symbol: symbol.toUpperCase(),
        name,
        category: category || AssetCategory.LIQUID_CRYPTO,
        currentPriceUsd,
        priceUpdatedAt: currentPriceUsd ? new Date() : null,
      },
    });

    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

const fromProviderSchema = z.object({
  provider: z.enum(['coingecko', 'yahoo', 'manual']),
  providerAssetId: z.string().min(1),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES),
  nativeCurrency: z.string().optional(),
  exchange: z.string().nullable().optional(),
  skipPriceFetch: z.boolean().optional(),
});

router.post('/from-provider', async (req, res, next) => {
  try {
    const data = fromProviderSchema.parse(req.body);

    // Equities live in categoryGroup 'equities'; reject mismatched provider/category
    // combinations early so we don't end up with a Yahoo-keyed row that the refresh
    // loop then fails to update.
    const providerCategoryError = externalProviderCategoryError(data.provider, data.category);
    if (providerCategoryError) {
      throw new AppError(providerCategoryError, 400);
    }

    const existing = await prisma.asset.findFirst({
      where: {
        OR: [
          { priceProvider: data.provider, providerAssetId: data.providerAssetId },
          { symbol: data.symbol.toUpperCase() },
        ],
      },
    });

    if (existing) return res.json(existing);

    let currentPriceUsd: number | null = null;
    let nativePrice: number | null = null;
    let nativeCurrency: string = data.nativeCurrency ?? 'USD';

    if (!data.skipPriceFetch && data.provider !== 'manual') {
      try {
        const priceMap = await priceService
          .getProvider(data.provider)
          .getPrices([data.providerAssetId]);
        const priceData = priceMap.get(data.providerAssetId);
        if (priceData) {
          currentPriceUsd = priceData.priceUsd;
          nativePrice = priceData.nativePrice ?? null;
          if (priceData.nativeCurrency) nativeCurrency = priceData.nativeCurrency;
        }
      } catch (error) {
        // Non-fatal — asset is created without price; next refresh cycle will fill in
        req.app.get('logger')?.warn?.('[Asset Create] price fetch failed:', error);
      }
    }

    const asset = await prisma.asset.create({
      data: {
        priceProvider: data.provider,
        providerAssetId: data.providerAssetId,
        coingeckoId: data.provider === 'coingecko' ? data.providerAssetId : null,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        category: data.category,
        nativeCurrency,
        exchange: data.exchange ?? null,
        currentPriceUsd,
        priceUpdatedAt: currentPriceUsd ? new Date() : null,
      },
    });

    if (currentPriceUsd !== null && data.provider !== 'manual') {
      await prisma.priceHistory.create({
        data: {
          assetId: asset.id,
          priceUsd: currentPriceUsd,
          nativePrice,
          nativeCurrency,
          source: data.provider,
        },
      });
    }

    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    requireAdminUser(req.userId);
    const data = updateAssetSchema.parse(req.body);

    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        ...data,
        symbol: data.symbol?.toUpperCase(),
      },
    });

    res.json(asset);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    requireAdminUser(req.userId);
    const positions = await prisma.position.findMany({
      where: { assetId: req.params.id },
    });

    if (positions.length > 0) {
      throw new AppError('Cannot delete asset with existing positions', 400);
    }

    await prisma.asset.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:id/refresh-price', async (req, res, next) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
    });

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    if (!asset.providerAssetId) {
      throw new AppError('Asset is not wired to a price provider', 400);
    }

    await requireUserHoldsAsset(req.userId!, asset.id);

    const provider = asset.priceProvider as ProviderName;
    if (provider === 'manual') {
      throw new AppError('Manual assets update via POST /assets/:id/nav', 400);
    }

    const priceMap = await priceService.getProvider(provider).getPrices([asset.providerAssetId]);
    const priceData = priceMap.get(asset.providerAssetId);

    if (!priceData) {
      throw new AppError(`Failed to fetch price from ${provider}`, 502);
    }

    const updated = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        currentPriceUsd: priceData.priceUsd,
        priceUpdatedAt: new Date(),
      },
    });

    await prisma.priceHistory.create({
      data: {
        assetId: asset.id,
        priceUsd: priceData.priceUsd,
        nativePrice: priceData.nativePrice ?? null,
        nativeCurrency: priceData.nativeCurrency ?? null,
        fxRateToUsd: priceData.fxRateToUsd ?? null,
        source: provider,
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

const createUnitTrustSchema = z.object({
  symbol: z.string().min(1).max(40),
  name: z.string().min(1),
  nativeCurrency: z.string().min(1).max(8).default('SGD'),
  factsheetUrl: z.string().url().optional().nullable(),
  isin: z.string().min(1).max(20).optional().nullable(),
  initialNav: z.number().positive().optional(),
  navAsOfDate: z.string().datetime().optional(),
  yahooSymbol: z.string().min(1).max(40).optional().nullable(),
});

router.post('/unit-trust', async (req, res, next) => {
  try {
    const data = createUnitTrustSchema.parse(req.body);
    const useYahoo = !!data.yahooSymbol;
    const provider: ProviderName = useYahoo ? 'yahoo' : 'manual';
    const providerAssetId = useYahoo
      ? data.yahooSymbol!.toUpperCase()
      : slugifyUtId(data.symbol, data.isin);

    const existing = await prisma.asset.findFirst({
      where: {
        OR: [{ priceProvider: provider, providerAssetId }, { symbol: data.symbol.toUpperCase() }],
      },
    });
    if (existing) return res.json(existing);

    let currentPriceUsd: number | null = null;
    let priceUpdatedAt: Date | null = null;
    let statementPriceHistory: {
      priceUsd: number;
      nativePrice: number;
      fxRateToUsd: number | null;
      timestamp: Date;
    } | null = null;

    if (data.initialNav !== undefined) {
      const converted = await navToUsd(data.initialNav, data.nativeCurrency);
      statementPriceHistory = {
        priceUsd: converted.priceUsd,
        nativePrice: data.initialNav,
        fxRateToUsd: converted.fxRateToUsd,
        timestamp: data.navAsOfDate ? new Date(data.navAsOfDate) : new Date(),
      };
      if (!useYahoo) {
        currentPriceUsd = converted.priceUsd;
        priceUpdatedAt = statementPriceHistory.timestamp;
      }
    }

    // For Yahoo-backed unit trusts, pull the live NAV now so currentPriceUsd is fresh
    // instead of the statement-date NAV (which is preserved separately in PriceHistory).
    let liveYahooPrice: {
      priceUsd: number;
      nativePrice: number;
      fxRateToUsd: number | null;
    } | null = null;
    if (useYahoo) {
      try {
        const priceMap = await priceService.getProvider('yahoo').getPrices([providerAssetId]);
        const priceData = priceMap.get(providerAssetId);
        if (priceData) {
          liveYahooPrice = {
            priceUsd: priceData.priceUsd,
            nativePrice: priceData.nativePrice ?? 0,
            fxRateToUsd: priceData.fxRateToUsd ?? null,
          };
          currentPriceUsd = priceData.priceUsd;
          priceUpdatedAt = new Date();
        }
      } catch (err) {
        logger.warn(`[unit-trust] Yahoo price fetch failed for ${providerAssetId}:`, err);
      }
    }

    const asset = await prisma.asset.create({
      data: {
        priceProvider: provider,
        providerAssetId,
        coingeckoId: null,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        category: AssetCategory.UNIT_TRUST,
        nativeCurrency: data.nativeCurrency.toUpperCase(),
        factsheetUrl: data.factsheetUrl ?? null,
        isin: data.isin ?? null,
        currentPriceUsd,
        priceUpdatedAt,
      },
    });

    if (statementPriceHistory) {
      await prisma.priceHistory.create({
        data: {
          assetId: asset.id,
          priceUsd: statementPriceHistory.priceUsd,
          nativePrice: statementPriceHistory.nativePrice,
          nativeCurrency: asset.nativeCurrency,
          fxRateToUsd: statementPriceHistory.fxRateToUsd,
          source: 'manual',
          updatedBy: req.userId ?? null,
          timestamp: statementPriceHistory.timestamp,
        },
      });
    }

    if (liveYahooPrice) {
      await prisma.priceHistory.create({
        data: {
          assetId: asset.id,
          priceUsd: liveYahooPrice.priceUsd,
          nativePrice: liveYahooPrice.nativePrice,
          nativeCurrency: asset.nativeCurrency,
          fxRateToUsd: liveYahooPrice.fxRateToUsd,
          source: 'yahoo',
        },
      });
    }

    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

const navUpdateSchema = z.object({
  navPrice: z.number().positive(),
  asOfDate: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

router.patch('/:id/nav', async (req, res, next) => {
  try {
    const data = navUpdateSchema.parse(req.body);

    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw new AppError('Asset not found', 404);
    if (asset.priceProvider !== 'manual') {
      throw new AppError('NAV updates only apply to manually-priced assets', 400);
    }

    await requireUserHoldsAsset(req.userId!, asset.id);

    const converted = await navToUsd(data.navPrice, asset.nativeCurrency);
    const timestamp = data.asOfDate ? new Date(data.asOfDate) : new Date();

    await prisma.priceHistory.upsert({
      where: { assetId_timestamp: { assetId: asset.id, timestamp } },
      update: {
        priceUsd: converted.priceUsd,
        nativePrice: data.navPrice,
        nativeCurrency: asset.nativeCurrency,
        fxRateToUsd: converted.fxRateToUsd,
        source: 'manual',
        updatedBy: req.userId ?? null,
      },
      create: {
        assetId: asset.id,
        priceUsd: converted.priceUsd,
        nativePrice: data.navPrice,
        nativeCurrency: asset.nativeCurrency,
        fxRateToUsd: converted.fxRateToUsd,
        source: 'manual',
        updatedBy: req.userId ?? null,
        timestamp,
      },
    });

    const latestNav = await prisma.priceHistory.findFirst({
      where: { assetId: asset.id, source: 'manual' },
      orderBy: { timestamp: 'desc' },
    });

    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        currentPriceUsd: latestNav?.priceUsd ?? converted.priceUsd,
        priceUpdatedAt: latestNav?.timestamp ?? timestamp,
      },
    });

    await priceService.updatePositionValues([asset.id]);

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/parse-unit-trust-statement',
  express.raw({ type: () => true, limit: '5mb' }),
  async (req, res, next) => {
    try {
      const body = req.body as unknown;
      logger.info(
        `[parse-ut-stmt] content-type=${req.headers['content-type']} bodyType=${body?.constructor?.name} isBuffer=${Buffer.isBuffer(body)} length=${Buffer.isBuffer(body) ? body.length : 'n/a'}`
      );

      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new AppError('PDF body is required (received empty or invalid body)', 400);
      }

      const pdfBuffer = body;

      const { PDFParse } = await import('pdf-parse');
      let extractedText: string;
      try {
        const pdfParser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
        const extracted = await pdfParser.getText();
        extractedText = extracted?.text ?? '';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'PDF read failed';
        throw new AppError(`Failed to read PDF: ${msg}`, 422);
      }

      if (!extractedText.trim()) {
        throw new AppError('PDF contains no extractable text (scanned image?)', 422);
      }

      const parsers = [
        { name: 'UOB Kay Hian', fn: parseUobKhStatement },
        { name: 'FSMOne', fn: parseFsmOneStatement },
      ];
      let parsed: ReturnType<typeof parseUobKhStatement> | undefined;
      const parseErrors: string[] = [];
      for (const p of parsers) {
        try {
          parsed = p.fn(extractedText);
          break;
        } catch (err) {
          parseErrors.push(`${p.name}: ${err instanceof Error ? err.message : 'parse failed'}`);
        }
      }
      if (!parsed) {
        throw new AppError(
          `Could not recognise statement format. Supported: UOB Kay Hian, FSMOne. (${parseErrors.join('; ')})`,
          422
        );
      }

      if (parsed.holdings.length === 0) {
        throw new AppError(
          'No unit trust holdings found in the statement. Please enter details manually.',
          422
        );
      }

      const yahooProvider = priceService.getProvider('yahoo');
      const enriched = await Promise.all(
        parsed.holdings.map(async (h) => {
          const { priceUsd, fxRateToUsd } = await navToUsd(h.navNative, h.nativeCurrency);
          const usdPerNative = fxRateToUsd ?? 1;
          const totalCostUsd = h.totalCostNative * usdPerNative;

          let yahooSymbol: string | null = null;
          if (h.isin) {
            try {
              const match =
                'searchByIsin' in yahooProvider
                  ? await (
                      yahooProvider as {
                        searchByIsin(isin: string): Promise<{ symbol: string } | null>;
                      }
                    ).searchByIsin(h.isin)
                  : null;
              yahooSymbol = match?.symbol ?? null;
            } catch (err) {
              logger.warn(`[parse-ut-stmt] ISIN lookup failed for ${h.isin}:`, err);
            }
          }

          return {
            symbol: h.symbol,
            name: h.name,
            isin: h.isin,
            nativeCurrency: h.nativeCurrency,
            units: h.units,
            avgCostNative: h.avgCostNative,
            navNative: h.navNative,
            navUsd: priceUsd,
            currentValueNative: h.currentValueNative,
            totalCostNative: h.totalCostNative,
            totalCostUsd,
            fxRateToUsd,
            navAsOfDate: parsed.periodEnd,
            yahooSymbol,
          };
        })
      );

      res.json({
        broker: parsed.broker,
        periodEnd: parsed.periodEnd,
        holdings: enriched,
      });
    } catch (error) {
      if (!(error instanceof AppError)) {
        logger.warn('Statement parse failed:', error);
      }
      next(error);
    }
  }
);

export default router;
