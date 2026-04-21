import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ASSET_CATEGORIES,
  AssetCategory,
  PriceProvider,
  categoryGroup,
} from '../lib/constants.js';
import type { ProviderName } from '../services/providers/types.js';

const router = Router();

const createAssetSchema = z.object({
  coingeckoId: z.string().optional(),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES).default(AssetCategory.LIQUID_CRYPTO),
  priceProvider: z.string().optional(),
  providerAssetId: z.string().optional(),
  nativeCurrency: z.string().optional(),
  exchange: z.string().optional(),
});

const updateAssetSchema = createAssetSchema.partial();

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
        positions: true,
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

    let currentPriceUsd: number | null = null;
    if (data.coingeckoId) {
      currentPriceUsd = await priceService.getDirectPrice(data.coingeckoId);
    }

    const asset = await prisma.asset.create({
      data: {
        ...data,
        symbol: data.symbol.toUpperCase(),
        currentPriceUsd,
        priceUpdatedAt: currentPriceUsd ? new Date() : null,
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
    const group = categoryGroup(data.category);
    if (data.provider === 'yahoo' && group !== 'equities') {
      throw new AppError('Yahoo provider only supports EQUITY category', 400);
    }
    if (data.provider === 'manual' && group !== 'unit_trusts') {
      throw new AppError('Manual provider only supports UNIT_TRUST category', 400);
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

export default router;
