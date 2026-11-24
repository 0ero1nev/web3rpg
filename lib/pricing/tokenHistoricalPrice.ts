export type TokenHistoricalPricePoint = {
  mint: string;
  bucketTimestamp: number;
  priceUsd: number;
  providerTimestamp: number;
  provider: "COINGECKO";
};

export type TokenHistoricalPriceStats = {
  requestedBuckets: number;
  cacheHits: number;
  externalRequests: number;
  providerAvailable: boolean;
  requestLimitReached: boolean;
  providerFailures: number;
  unsupportedToken: boolean;
  failureReason: "NO_API_KEY" | "UNSUPPORTED_TOKEN" | "PROVIDER_FAILURE" | null;
};

export type TokenHistoricalPriceResult = {
  prices: Map<number, TokenHistoricalPricePoint | null>;
  stats: TokenHistoricalPriceStats;
};

export type TokenHistoricalPriceBudget = {
  externalRequests: number;
  maxExternalRequests: number;
};

export type TokenHistoricalPriceOptions = {
  budget?: TokenHistoricalPriceBudget;
  fetcher?: typeof fetch;
  nowMs?: number;
};

type CoinGeckoRange = { prices?: Array<[number, number]> };
type CacheEntry = {
  expiresAt: number;
  point: TokenHistoricalPricePoint | null;
};

const DEMO_ORIGIN = "https://api.coingecko.com";
const PRO_ORIGIN = "https://pro-api.coingecko.com";
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const SUCCESS_TTL_MS = 7 * DAY_SECONDS * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100_000;
const MAX_RANGE_SECONDS = 365 * DAY_SECONDS;
const MAX_DISTANCE_SECONDS = 18 * HOUR_SECONDS;
const PROVIDER_TIMEOUT_MS = 10_000;
const REQUEST_SPACING_MS = 250;

const cache = new Map<string, CacheEntry>();
let lastProviderRequestAt = 0;
let providerStartQueue: Promise<void> = Promise.resolve();

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function throttleProviderRequest() {
  // Serialize only request starts, not the requests themselves. Concurrent
  // mint lookups may remain in flight together while preserving the provider's
  // 250 ms start spacing and avoiding a synchronized burst.
  const scheduled = providerStartQueue.then(async () => {
    const wait = REQUEST_SPACING_MS - (Date.now() - lastProviderRequestAt);
    if (wait > 0) await delay(wait);
    lastProviderRequestAt = Date.now();
  });
  providerStartQueue = scheduled.catch(() => undefined);
  await scheduled;
}

function reserveRequest(budget: TokenHistoricalPriceBudget): boolean {
  if (budget.externalRequests >= budget.maxExternalRequests) return false;
  // Reservation happens synchronously before any await, so concurrent mint
  // workers cannot overshoot the shared per-wallet request budget.
  budget.externalRequests += 1;
  return true;
}

export function tokenPriceBucket(timestamp: number) {
  return Math.floor(timestamp / HOUR_SECONDS) * HOUR_SECONDS;
}

function key(mint: string, bucket: number) {
  return `${mint}:${bucket}`;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getConfiguration() {
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  if (!apiKey) return null;
  const pro = process.env.COINGECKO_API_PLAN?.toLowerCase() === "pro";
  return {
    apiKey,
    origin: pro ? PRO_ORIGIN : DEMO_ORIGIN,
    header: pro ? "x-cg-pro-api-key" : "x-cg-demo-api-key",
  };
}

export function isTokenHistoricalPriceProviderConfigured() {
  return getConfiguration() !== null;
}

function readCache(mint: string, bucket: number, nowMs: number) {
  const cacheKey = key(mint, bucket);
  const item = cache.get(cacheKey);
  if (!item) return undefined;
  if (item.expiresAt <= nowMs) {
    cache.delete(cacheKey);
    return undefined;
  }
  return item.point;
}

function writeCache(
  mint: string,
  bucket: number,
  point: TokenHistoricalPricePoint | null,
  nowMs: number,
) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key(mint, bucket), {
    point,
    expiresAt: nowMs + (point ? SUCCESS_TTL_MS : MISS_TTL_MS),
  });
}

function nearest(
  mint: string,
  bucket: number,
  points: Array<{ timestamp: number; priceUsd: number }>,
) {
  let match: { timestamp: number; priceUsd: number } | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const candidateDistance = Math.abs(point.timestamp - bucket);
    if (candidateDistance < distance) {
      match = point;
      distance = candidateDistance;
    }
  }
  if (!match || distance > MAX_DISTANCE_SECONDS) return null;
  return {
    mint,
    bucketTimestamp: bucket,
    priceUsd: match.priceUsd,
    providerTimestamp: match.timestamp,
    provider: "COINGECKO" as const,
  };
}

async function fetchRange(
  mint: string,
  from: number,
  to: number,
  fetcher: typeof fetch,
  configuration: NonNullable<ReturnType<typeof getConfiguration>>,
): Promise<{
  points: Array<{ timestamp: number; priceUsd: number }>;
  outcome: "OK" | "UNSUPPORTED_TOKEN" | "PROVIDER_FAILURE";
}> {
  const url = new URL(`/api/v3/coins/solana/contract/${encodeURIComponent(mint)}/market_chart/range`, configuration.origin);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  if (to - from <= 100 * DAY_SECONDS) url.searchParams.set("interval", "hourly");
  try {
    const response = await fetcher(url, {
      headers: { [configuration.header]: configuration.apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (response.status === 404) return { points: [], outcome: "UNSUPPORTED_TOKEN" };
    if (!response.ok) return { points: [], outcome: "PROVIDER_FAILURE" };
    const payload = await response.json() as CoinGeckoRange;
    const points = (payload.prices ?? []).flatMap(([milliseconds, priceUsd]) => {
      const timestamp = milliseconds / 1000;
      return finitePositive(timestamp) && finitePositive(priceUsd)
        ? [{ timestamp, priceUsd }]
        : [];
    });
    return {
      points,
      outcome: points.length > 0 ? "OK" : "UNSUPPORTED_TOKEN",
    };
  } catch {
    return { points: [], outcome: "PROVIDER_FAILURE" };
  }
}

/**
 * Resolves sampled historical prices in batched ranges. Missing data is cached
 * as a miss and remains null; this function never substitutes a current price.
 */
export async function getTokenHistoricalPricesUsd(
  mint: string,
  timestamps: number[],
  options: TokenHistoricalPriceOptions = {},
): Promise<TokenHistoricalPriceResult> {
  const nowMs = options.nowMs ?? Date.now();
  const buckets = [...new Set(timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .map(tokenPriceBucket))].sort((a, b) => a - b);
  const prices = new Map<number, TokenHistoricalPricePoint | null>();
  const missing: number[] = [];
  let cacheHits = 0;

  for (const bucket of buckets) {
    const cached = readCache(mint, bucket, nowMs);
    if (cached !== undefined) {
      prices.set(bucket, cached);
      cacheHits += 1;
    } else {
      missing.push(bucket);
    }
  }

  const configuration = getConfiguration();
  const budget = options.budget ?? { externalRequests: 0, maxExternalRequests: 20 };
  let externalRequests = 0;
  let requestLimitReached = false;
  let providerFailures = 0;
  let unsupportedToken = false;

  if (!configuration) {
    for (const bucket of missing) prices.set(bucket, null);
    return {
      prices,
      stats: {
        requestedBuckets: buckets.length,
        cacheHits,
        externalRequests,
        providerAvailable: false,
        requestLimitReached,
        providerFailures,
        unsupportedToken,
        failureReason: "NO_API_KEY",
      },
    };
  }

  let cursor = 0;
  while (cursor < missing.length) {
    if (!reserveRequest(budget)) {
      requestLimitReached = true;
      break;
    }
    const range: number[] = [missing[cursor]];
    cursor += 1;
    while (
      cursor < missing.length
      && missing[cursor] - range[0] <= MAX_RANGE_SECONDS
    ) {
      range.push(missing[cursor]);
      cursor += 1;
    }
    await throttleProviderRequest();
    externalRequests += 1;
    let response = await fetchRange(
      mint,
      range[0] - HOUR_SECONDS,
      range[range.length - 1] + DAY_SECONDS,
      options.fetcher ?? fetch,
      configuration,
    );
    if (response.outcome === "PROVIDER_FAILURE") {
      if (reserveRequest(budget)) {
        await delay(1_000);
        await throttleProviderRequest();
        externalRequests += 1;
        response = await fetchRange(
          mint,
          range[0] - HOUR_SECONDS,
          range[range.length - 1] + DAY_SECONDS,
          options.fetcher ?? fetch,
          configuration,
        );
      } else {
        requestLimitReached = true;
      }
    }
    if (response.outcome === "PROVIDER_FAILURE") providerFailures += 1;
    if (response.outcome === "UNSUPPORTED_TOKEN") unsupportedToken = true;
    for (const bucket of range) {
      const point = nearest(mint, bucket, response.points);
      writeCache(mint, bucket, point, nowMs);
      prices.set(bucket, point);
    }
    // A contract-level 404 applies to the mint, not just this date range.
    // Avoid spending the remaining wallet budget on identical known misses.
    if (response.outcome === "UNSUPPORTED_TOKEN") {
      for (const bucket of missing.slice(cursor)) {
        writeCache(mint, bucket, null, nowMs);
        prices.set(bucket, null);
      }
      cursor = missing.length;
    }
  }

  for (const bucket of missing) {
    if (!prices.has(bucket)) prices.set(bucket, null);
  }
  return {
    prices,
    stats: {
      requestedBuckets: buckets.length,
      cacheHits,
      externalRequests,
      providerAvailable: true,
      requestLimitReached,
      providerFailures,
      unsupportedToken,
      failureReason: providerFailures > 0
        ? "PROVIDER_FAILURE"
        : unsupportedToken
          ? "UNSUPPORTED_TOKEN"
          : null,
    },
  };
}

export const TOKEN_HISTORICAL_PRICE_MAX_REQUESTS_PER_WALLET = 20;
