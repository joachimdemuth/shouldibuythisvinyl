import { DiscogsContext, MarketStats, SupportedCurrency } from "@/lib/types";

const RATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const rateCache = new Map<string, { rate: number; expiresAt: number }>();

interface FrankfurterResponse {
  rates?: Record<string, number>;
}

function buildCacheKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export async function fetchExchangeRate(args: {
  from: string;
  to: SupportedCurrency;
}): Promise<number | null> {
  const { from, to } = args;
  const normalizedFrom = from.toUpperCase();
  if (normalizedFrom === to) return 1;

  const cacheKey = buildCacheKey(normalizedFrom, to);
  const cached = rateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rate;
  }

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(normalizedFrom)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as FrankfurterResponse;
  const rate = data.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  rateCache.set(cacheKey, {
    rate,
    expiresAt: Date.now() + RATE_CACHE_TTL_MS,
  });
  return rate;
}

function convertMarket(market: MarketStats, to: SupportedCurrency, rate: number): MarketStats {
  return {
    low: typeof market.low === "number" ? market.low * rate : undefined,
    median: typeof market.median === "number" ? market.median * rate : undefined,
    high: typeof market.high === "number" ? market.high * rate : undefined,
    currency: to,
    originalCurrency: market.currency,
    exchangeRate: rate,
  };
}

export async function convertDiscogsContextToCurrency(args: {
  discogs: DiscogsContext;
  targetCurrency: SupportedCurrency;
}): Promise<DiscogsContext> {
  const { discogs, targetCurrency } = args;
  if (!discogs.market?.currency) return discogs;

  const fromCurrency = discogs.market.currency.toUpperCase();
  if (fromCurrency === targetCurrency) {
    return {
      ...discogs,
      market: {
        ...discogs.market,
        currency: targetCurrency,
      },
    };
  }

  const rate = await fetchExchangeRate({
    from: fromCurrency,
    to: targetCurrency,
  });
  if (!rate) {
    return {
      ...discogs,
      searchNotes:
        discogs.searchNotes ??
        `Could not convert ${fromCurrency} market stats to ${targetCurrency}.`,
    };
  }

  return {
    ...discogs,
    market: convertMarket(discogs.market, targetCurrency, rate),
  };
}
