import express, { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ASSET_CATEGORIES,
  AssetCategory,
  MAX_ASSET_NAME_LENGTH,
  MAX_ASSET_SYMBOL_LENGTH,
  PriceProvider,
} from '../lib/constants.js';
import { externalProviderCategoryError } from '../lib/domain.js';
import { requireAdminUser, requireUserHoldsAsset } from '../lib/authorization.js';
import type { AssetPriceProvider, ProviderName } from '../services/providers/types.js';
import { normalizeOfficialDomain } from '../services/news/sourceQuality.js';
import { parseUobKhStatement } from '../services/statementParsers/uobKayHian.js';
import { parseFsmOneStatement } from '../services/statementParsers/fsmOne.js';
import { extractPdfText, type PdfTextResult } from '../services/statementParsers/pdfText.js';
import { logger } from '../lib/logger.js';
import {
  navToUsd,
  saveManualNav,
  navTransaction,
  parseManualNavDate,
} from '../services/unitTrustNavService.js';
import { findFundManagerSource } from '../services/providers/fundManagerSources.js';

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
  name: z.string().trim().min(1).max(MAX_ASSET_NAME_LENGTH),
  category: z.enum(ASSET_CATEGORIES).default(AssetCategory.LIQUID_CRYPTO),
  priceProvider: z.enum(['coingecko', 'yahoo', 'manual']).optional(),
  providerAssetId: z.string().nullable().optional(),
  nativeCurrency: z.string().optional(),
  exchange: z.string().nullable().optional(),
  currentPriceUsd: z.number().nonnegative().optional(),
});

const updateAssetSchema = createAssetSchema
  .omit({ currentPriceUsd: true })
  .partial()
  .extend({
    // Issuer/protocol official site; normalized to a bare registrable domain.
    // Invalid input clears the field rather than storing junk.
    officialDomain: z
      .string()
      .max(255)
      .nullable()
      .optional()
      .transform((value) => (value === undefined ? undefined : normalizeOfficialDomain(value))),
  });

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

// CoinGecko ids are slugs ("wrapped-bitcoin"); generous but bounded.
const MAX_COINGECKO_ID_LENGTH = 128;

const fromCoinGeckoSchema = z.object({
  coingeckoId: z.string().min(1).max(MAX_COINGECKO_ID_LENGTH),
  // Some CoinGecko tickers are longer than the 20-char manual-entry limit.
  symbol: z.string().min(1).max(MAX_ASSET_SYMBOL_LENGTH),
  name: z.string().trim().min(1).max(MAX_ASSET_NAME_LENGTH),
  category: z.enum(ASSET_CATEGORIES).default(AssetCategory.LIQUID_CRYPTO),
  skipPriceFetch: z.boolean().optional(),
});

router.post('/from-coingecko', async (req, res, next) => {
  try {
    const { coingeckoId, symbol, name, category, skipPriceFetch } = fromCoinGeckoSchema.parse(
      req.body
    );

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
        category,
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
  name: z.string().trim().min(1).max(MAX_ASSET_NAME_LENGTH),
  category: z.enum(ASSET_CATEGORIES),
  nativeCurrency: z.string().optional(),
  exchange: z.string().nullable().optional(),
  skipPriceFetch: z.boolean().optional(),
});

function providerMetadataUpdates(
  existing: {
    priceProvider: string | null;
    providerAssetId: string | null;
    nativeCurrency: string;
    exchange: string | null;
    currentPriceNative?: number | null;
  },
  data: z.infer<typeof fromProviderSchema>
): Prisma.AssetUpdateInput | null {
  if (existing.priceProvider !== data.provider) return null;

  const updates: Prisma.AssetUpdateInput = {};
  const nativeCurrency = data.nativeCurrency?.trim().toUpperCase();

  if (
    existing.currentPriceNative != null &&
    (existing.providerAssetId !== data.providerAssetId ||
      (nativeCurrency && existing.nativeCurrency !== nativeCurrency))
  ) {
    throw new AppError(
      'A priced fund’s currency and share-class identity cannot change during import',
      409
    );
  }

  if (existing.providerAssetId !== data.providerAssetId) {
    updates.providerAssetId = data.providerAssetId;
  }
  if (nativeCurrency && existing.nativeCurrency !== nativeCurrency) {
    updates.nativeCurrency = nativeCurrency;
  }
  if (data.exchange !== undefined && existing.exchange !== (data.exchange ?? null)) {
    updates.exchange = data.exchange ?? null;
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

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

    if (existing) {
      const updates = providerMetadataUpdates(existing, data);
      if (updates) {
        const updated = await prisma.asset.update({
          where: { id: existing.id },
          data: updates,
        });
        return res.json(updated);
      }
      return res.json(existing);
    }

    let currentPriceUsd: number | null = null;
    let nativePrice: number | null = null;
    let nativeCurrency: string = data.nativeCurrency?.trim().toUpperCase() ?? 'USD';

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

const PRICED_FUND_IDENTITY_FIELDS = [
  'nativeCurrency',
  'priceProvider',
  'providerAssetId',
  'category',
] as const;

router.put('/:id', async (req, res, next) => {
  try {
    requireAdminUser(req.userId);
    const data = updateAssetSchema.parse(req.body);

    const asset = await navTransaction(async (tx) => {
      const existing = await tx.asset.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new AppError('Asset not found', 404);
      if (
        existing.currentPriceNative != null &&
        PRICED_FUND_IDENTITY_FIELDS.some(
          (field) => data[field] !== undefined && data[field] !== existing[field]
        )
      ) {
        throw new AppError(
          'A priced fund’s currency, provider identity and category cannot change',
          409
        );
      }
      return tx.asset.update({
        where: { id: existing.id },
        data: {
          ...data,
          symbol: data.symbol?.toUpperCase(),
        },
      });
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

    if (asset.category === 'UNIT_TRUST' && asset.priceProvider !== 'manual') {
      try {
        return res.json(await priceService.refreshUnitTrust(asset.id));
      } catch {
        throw new AppError('NAV refresh failed; the last good valuation has been retained', 502);
      }
    }

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
  symbol: z.string().min(1).max(MAX_ASSET_SYMBOL_LENGTH),
  name: z.string().trim().min(1).max(MAX_ASSET_NAME_LENGTH),
  nativeCurrency: z.string().min(1).max(8).default('SGD'),
  factsheetUrl: z.string().url().optional().nullable(),
  isin: z.string().min(1).max(20).optional().nullable(),
  initialNav: z.number().finite().positive().optional(),
  navAsOfDate: z.string().datetime().optional(),
  yahooSymbol: z.string().min(1).max(40).optional().nullable(),
});

router.post('/unit-trust', async (req, res, next) => {
  try {
    const data = createUnitTrustSchema.parse(req.body);
    const nativeCurrency = data.nativeCurrency.toUpperCase();
    const manager = findFundManagerSource({
      ...data,
      nativeCurrency,
      priceProvider: data.yahooSymbol ? 'yahoo' : 'manual',
      providerAssetId: data.yahooSymbol,
    });
    const provider: ProviderName = manager ? 'fund-manager' : data.yahooSymbol ? 'yahoo' : 'manual';
    const providerAssetId =
      manager?.isin ?? data.yahooSymbol?.toUpperCase() ?? slugifyUtId(data.symbol, data.isin);
    const existing = await prisma.asset.findFirst({
      where: {
        OR: [
          { priceProvider: provider, providerAssetId },
          ...(data.isin ? [{ category: 'UNIT_TRUST', isin: data.isin.toUpperCase() }] : []),
          { symbol: data.symbol.toUpperCase() },
        ],
      },
    });
    if (existing) {
      if (
        existing.category !== 'UNIT_TRUST' ||
        existing.nativeCurrency !== nativeCurrency ||
        (data.isin && existing.isin && data.isin.toUpperCase() !== existing.isin.toUpperCase())
      ) {
        throw new AppError('Existing symbol belongs to a different fund or share class', 409);
      }
      return res.json(existing);
    }
    // Validate before creating a catalog row; imports with unavailable FX can retry.
    if (data.initialNav !== undefined) {
      parseManualNavDate(data.navAsOfDate);
      await navToUsd(data.initialNav, nativeCurrency);
    }
    let asset = await navTransaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          priceProvider: provider,
          providerAssetId,
          coingeckoId: null,
          symbol: data.symbol.toUpperCase(),
          name: data.name,
          category: AssetCategory.UNIT_TRUST,
          nativeCurrency,
          factsheetUrl: data.factsheetUrl ?? null,
          isin: manager?.isin ?? data.isin?.toUpperCase() ?? null,
          priceCheckStatus: provider === 'manual' ? null : 'pending',
        },
      });
      return data.initialNav === undefined
        ? created
        : saveManualNav(created.id, data.initialNav, data.navAsOfDate, req.userId!, tx);
    });
    if (provider !== 'manual') {
      try {
        asset = await priceService.refreshUnitTrust(asset.id);
      } catch (error) {
        logger.warn(
          '[unit-trust] Automatic NAV unavailable; retaining dated statement fallback',
          error
        );
        asset = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      }
    }
    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

const navUpdateSchema = z.object({
  navPrice: z.number().finite().positive(),
  asOfDate: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

router.patch('/:id/nav', async (req, res, next) => {
  try {
    const data = navUpdateSchema.parse(req.body);
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw new AppError('Asset not found', 404);
    await requireUserHoldsAsset(req.userId!, asset.id);
    res.json(await saveManualNav(asset.id, data.navPrice, data.asOfDate, req.userId!));
  } catch (error) {
    next(error);
  }
});

// Real statements extract to a few KB to tens of KB of text, but PDF content
// streams are compressed, so a 5 MB upload can inflate far past that. Cap the
// text before the statement parsers' regexes run over it.
const MAX_STATEMENT_TEXT_CHARS = 1_000_000;
// Monthly statements are a few pages and read in well under a second; these
// bound what one crafted PDF can make pdf.js do.
const MAX_STATEMENT_PAGES = 30;
const STATEMENT_READ_TIMEOUT_MS = 5_000;
// Each holding costs an FX read and a Yahoo search; real statements list a handful.
const MAX_STATEMENT_HOLDINGS = 50;

// The statement text from a bounded PDF read, or the error the upload dialog shows.
function statementTextOrThrow(read: PdfTextResult): string {
  switch (read.status) {
    case 'ok':
      return read.text;
    case 'busy':
      logger.warn('[parse-ut-stmt] rejected: another statement is being read');
      throw new AppError(
        'Another statement is being read right now. Try again in a few seconds.',
        503
      );
    case 'too-many-pages':
      logger.warn(`[parse-ut-stmt] rejected: PDF has ${read.pages} pages`);
      throw new AppError(
        `This PDF has ${read.pages} pages; a statement import reads at most ${MAX_STATEMENT_PAGES}. Upload a single UOB Kay Hian or FSMOne monthly statement PDF.`,
        422
      );
    case 'too-much-text':
      logger.warn(`[parse-ut-stmt] extracted text too long: ${read.chars} chars`);
      throw new AppError(
        'This PDF has too much text to be a monthly statement. Upload a single UOB Kay Hian or FSMOne monthly statement PDF.',
        422
      );
    case 'too-costly':
      logger.warn('[parse-ut-stmt] rejected: PDF read ran out of time or memory');
      throw new AppError(
        'This PDF is too large or complex to read. Upload a single UOB Kay Hian or FSMOne monthly statement PDF.',
        422
      );
  }
}

async function searchYahooSymbol(
  provider: AssetPriceProvider,
  isin: string
): Promise<string | null> {
  try {
    const match =
      'searchByIsin' in provider
        ? await (
            provider as {
              searchByIsin(isin: string): Promise<{ symbol: string } | null>;
            }
          ).searchByIsin(isin)
        : null;
    return match?.symbol ?? null;
  } catch (err) {
    logger.warn(`[parse-ut-stmt] ISIN lookup failed for ${isin}:`, err);
    return null;
  }
}

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

      let read: PdfTextResult;
      try {
        read = await extractPdfText(new Uint8Array(pdfBuffer), {
          maxPages: MAX_STATEMENT_PAGES,
          maxTextChars: MAX_STATEMENT_TEXT_CHARS,
          timeoutMs: STATEMENT_READ_TIMEOUT_MS,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'PDF read failed';
        throw new AppError(`Failed to read PDF: ${msg}`, 422);
      }
      const extractedText = statementTextOrThrow(read);

      if (!extractedText.trim()) {
        throw new AppError(
          'This PDF has no selectable text — it may be a scanned copy. Upload a digitally generated statement PDF.',
          422
        );
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
        // Parser internals stay in the logs; the user-facing message only names the fix.
        logger.warn(`[parse-ut-stmt] no parser matched: ${parseErrors.join('; ')}`);
        throw new AppError(
          'Could not recognize this statement format. Upload a UOB Kay Hian or FSMOne monthly statement PDF.',
          422
        );
      }

      if (parsed.holdings.length === 0) {
        throw new AppError(
          'No unit trust holdings found in the statement. Please enter details manually.',
          422
        );
      }
      if (parsed.holdings.length > MAX_STATEMENT_HOLDINGS) {
        logger.warn(`[parse-ut-stmt] rejected: statement lists ${parsed.holdings.length} holdings`);
        throw new AppError(
          `This statement lists ${parsed.holdings.length} holdings; one import takes at most ${MAX_STATEMENT_HOLDINGS}. Add these holdings manually instead.`,
          422
        );
      }

      const yahooProvider = priceService.getProvider('yahoo');
      // One Yahoo search per distinct ISIN: a fund held two ways (Cash and SRS) repeats.
      const symbolLookups = new Map<string, Promise<string | null>>();
      const lookUpYahooSymbol = (isin: string) => {
        let lookup = symbolLookups.get(isin);
        if (!lookup) {
          lookup = searchYahooSymbol(yahooProvider, isin);
          symbolLookups.set(isin, lookup);
        }
        return lookup;
      };
      const enriched = await Promise.all(
        parsed.holdings.map(async (h) => {
          const { priceUsd, fxRateToUsd } = await navToUsd(h.navNative, h.nativeCurrency);
          const usdPerNative = fxRateToUsd ?? 1;
          const totalCostUsd = h.totalCostNative * usdPerNative;
          const yahooSymbol = h.isin ? await lookUpYahooSymbol(h.isin) : null;

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
