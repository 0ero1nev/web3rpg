import type {
  HistoricalPricingFailureCategory,
  HistoricalPricingDiagnostics,
  HistoricalPricingStatus,
} from "../analysis/valuationTypes";

export type HistoricalPriceAsset = "SOL";

export type HistoricalPricePoint = {
  asset: HistoricalPriceAsset;
  bucketTimestamp: number;
  priceUsd: number;
  providerTimestamp: number;
};

export type HistoricalPriceLoadResult = {
  prices: Map<number, HistoricalPricePoint | null>;
  diagnostics: HistoricalPricingDiagnostics;
};

export type HistoricalPriceLoadOptions = {
  fetchImpl?: typeof fetch;
};

type CoinGeckoMarketChartRange = {
  prices?: Array<[number, number]>;
};

const COINGECKO_ORIGIN = "https://api.coingecko.com";
const PRICE_BUCKET_SECONDS = 60 * 60;
const MAX_RANGE_SECONDS = 12 * 24 * 60 * 60;
const MAX_PRICE_DISTANCE_SECONDS = 2 * 60 * 60;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20_000;
const MAX_RATE_LIMIT_RETRIES = 2;
const PROVIDER_TIMEOUT_MS = 10_000;

type CacheEntry = {
  expiresAt: number;
  point: HistoricalPricePoint | null;
};

const priceCache = new Map<string, CacheEntry>();
const pendingPriceRequests = new Map<string, Promise<HistoricalPricePoint | null>>();

function cacheKey(asset: HistoricalPriceAsset, bucketTimestamp: number) {
  return `${asset}:${bucketTimestamp}`;
}

export function historicalPriceBucket(timestamp: number) {
  return Math.floor(timestamp / PRICE_BUCKET_SECONDS) * PRICE_BUCKET_SECONDS;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function setCachedPrice(
  asset: HistoricalPriceAsset,
  bucketTimestamp: number,
  point: HistoricalPricePoint | null,
) {
  if (priceCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = priceCache.keys().next().value as string | undefined;
    if (firstKey) priceCache.delete(firstKey);
  }
  priceCache.set(cacheKey(asset, bucketTimestamp), {
    point,
    expiresAt: Date.now() + (point ? SUCCESS_TTL_MS : MISS_TTL_MS),
  });
}

function getCachedPrice(asset: HistoricalPriceAsset, bucketTimestamp: number) {
  const key = cacheKey(asset, bucketTimestamp);
  const cached = priceCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    priceCache.delete(key);
    return undefined;
  }
  return cached.point;
}

type ProviderRangeResult = {
  prices: Array<{ timestamp: number; price: number }>;
  requestCount: number;
  failureCount: number;
  providerResponded: boolean;
  failures: HistoricalPricingFailureCategory[];
};

function categoryForStatus(status: number): HistoricalPricingFailureCategory {
  if (status === 429) return "HTTP_429";
  if (status === 403) return "HTTP_403";
  if (status >= 500) return "HTTP_5XX";
  return "HTTP_OTHER";
}

const FAILURE_CATEGORIES: HistoricalPricingFailureCategory[] = [
  "TIMEOUT", "DNS", "PROXY_CONNECTION", "TLS", "HTTP_429", "HTTP_403",
  "HTTP_5XX", "HTTP_OTHER", "INVALID_RESPONSE", "NETWORK_OTHER",
];

function categoryForResponse(response: Response): HistoricalPricingFailureCategory {
  const bridged = response.headers.get("x-pricing-failure-category") as HistoricalPricingFailureCategory | null;
  return bridged && FAILURE_CATEGORIES.includes(bridged) ? bridged : categoryForStatus(response.status);
}

async function fetchProviderRequest(
  provider: "coinbase" | "coingecko",
  from: number,
  to: number,
  url: URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const bridgeUrl = process.env.LOCAL_PRICING_BRIDGE_URL;
  if (!bridgeUrl) return fetchImpl(url, init);
  return fetchImpl(bridgeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, from, to }),
    cache: "no-store",
    signal: init.signal,
  });
}

function categoryForError(error: unknown): HistoricalPricingFailureCategory {
  const value = error as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string } };
  const code = `${value.code ?? ""} ${value.cause?.code ?? ""}`.toUpperCase();
  const message = `${value.name ?? ""} ${value.message ?? ""} ${value.cause?.message ?? ""}`.toLowerCase();
  if (value.name === "TimeoutError" || value.name === "AbortError" || message.includes("timeout")) return "TIMEOUT";
  if (code.includes("ENOTFOUND") || code.includes("EAI_AGAIN")) return "DNS";
  if (code.includes("ECONNREFUSED") || message.includes("proxy")) return "PROXY_CONNECTION";
  if (code.includes("CERT") || code.includes("TLS") || message.includes("certificate")) return "TLS";
  return "NETWORK_OTHER";
}

function recordProviderFailure(
  provider: "coinbase" | "coingecko",
  category: HistoricalPricingFailureCategory,
  elapsedMs: number,
  status?: number,
) {
  // Deliberately omit URL, raw error text, proxy values, and credentials.
  console.warn("[historical-pricing] provider failure", {
    provider,
    category,
    elapsedMs,
    ...(status === undefined ? {} : { status }),
  });
}

async function fetchCoinGeckoSolRange(
  from: number,
  to: number,
  fetchImpl: typeof fetch,
): Promise<ProviderRangeResult> {
  const url = new URL("/api/v3/coins/solana/market_chart/range", COINGECKO_ORIGIN);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  url.searchParams.set("interval", "hourly");

  const apiKey = process.env.COINGECKO_API_KEY;
  let requestCount = 0;
  let failureCount = 0;
  const failures: HistoricalPricingFailureCategory[] = [];
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const startedAt = Date.now();
    try {
      requestCount += 1;
      const response = await fetchProviderRequest("coingecko", from, to, url, {
        headers: apiKey ? { "x-cg-demo-api-key": apiKey } : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      }, fetchImpl);
      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        failureCount += 1;
        failures.push("HTTP_429");
        recordProviderFailure("coingecko", "HTTP_429", Date.now() - startedAt, response.status);
        const retryAfter = Number(response.headers.get("retry-after"));
        await delay(Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5_000)
          : 750 * (2 ** attempt));
        continue;
      }
      if (!response.ok) {
        failureCount += 1;
        const category = categoryForResponse(response);
        failures.push(category);
        recordProviderFailure("coingecko", category, Date.now() - startedAt, response.status);
        return { prices: [], requestCount, failureCount, providerResponded: false, failures };
      }
      const payload = await response.json() as CoinGeckoMarketChartRange;
      const prices = (payload.prices ?? []).flatMap(([milliseconds, price]) => {
        const timestamp = milliseconds / 1000;
        return finitePositive(timestamp) && finitePositive(price)
          ? [{ timestamp, price }]
          : [];
      });
      return { prices, requestCount, failureCount, providerResponded: true, failures };
    } catch (error) {
      failureCount += 1;
      const category = categoryForError(error);
      failures.push(category);
      recordProviderFailure("coingecko", category, Date.now() - startedAt);
      if (attempt === MAX_RATE_LIMIT_RETRIES) {
        return { prices: [], requestCount, failureCount, providerResponded: false, failures };
      }
      await delay(500 * (2 ** attempt));
    }
  }
  return { prices: [], requestCount, failureCount, providerResponded: false, failures };
}

async function fetchCoinbaseSolRange(
  from: number,
  to: number,
  fetchImpl: typeof fetch,
): Promise<ProviderRangeResult> {
  const url = new URL("https://api.exchange.coinbase.com/products/SOL-USD/candles");
  url.searchParams.set("granularity", String(PRICE_BUCKET_SECONDS));
  url.searchParams.set("start", new Date(from * 1000).toISOString());
  url.searchParams.set("end", new Date(Math.min(to, Date.now() / 1000) * 1000).toISOString());
  const startedAt = Date.now();
  try {
    const response = await fetchProviderRequest("coinbase", from, to, url, {
      headers: { "User-Agent": "web3rpg-wallet-analysis/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    }, fetchImpl);
    if (!response.ok) {
      const category = categoryForResponse(response);
      recordProviderFailure("coinbase", category, Date.now() - startedAt, response.status);
      return { prices: [], requestCount: 1, failureCount: 1, providerResponded: false, failures: [category] };
    }
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) {
      recordProviderFailure("coinbase", "INVALID_RESPONSE", Date.now() - startedAt);
      return { prices: [], requestCount: 1, failureCount: 1, providerResponded: false, failures: ["INVALID_RESPONSE"] };
    }
    const prices = payload.flatMap((candle) => {
      if (!Array.isArray(candle)) return [];
      const timestamp = Number(candle[0]);
      const close = Number(candle[4]);
      return finitePositive(timestamp) && finitePositive(close)
        ? [{ timestamp, price: close }]
          : [];
    });
    return { prices, requestCount: 1, failureCount: 0, providerResponded: true, failures: [] };
  } catch (error) {
    const category = categoryForError(error);
    recordProviderFailure("coinbase", category, Date.now() - startedAt);
    return { prices: [], requestCount: 1, failureCount: 1, providerResponded: false, failures: [category] };
  }
}

type SolRangeResult = {
  prices: Array<{ timestamp: number; price: number }>;
  providerResponded: boolean;
  coinbaseRequestCount: number;
  coinbaseFailureCount: number;
  coingeckoRequestCount: number;
  coingeckoFailureCount: number;
  failures: HistoricalPricingFailureCategory[];
};

async function fetchHistoricalSolRange(
  from: number,
  to: number,
  fetchImpl: typeof fetch,
): Promise<SolRangeResult> {
  const coinbase = await fetchCoinbaseSolRange(from, to, fetchImpl);
  if (coinbase.prices.length > 0) {
    return {
      prices: coinbase.prices,
      providerResponded: coinbase.providerResponded,
      coinbaseRequestCount: coinbase.requestCount,
      coinbaseFailureCount: coinbase.failureCount,
      coingeckoRequestCount: 0,
      coingeckoFailureCount: 0,
      failures: coinbase.failures,
    };
  }
  const coingecko = await fetchCoinGeckoSolRange(from, to, fetchImpl);
  return {
    prices: coingecko.prices,
    providerResponded: coinbase.providerResponded || coingecko.providerResponded,
    coinbaseRequestCount: coinbase.requestCount,
    coinbaseFailureCount: coinbase.failureCount,
    coingeckoRequestCount: coingecko.requestCount,
    coingeckoFailureCount: coingecko.failureCount,
    failures: [...coinbase.failures, ...coingecko.failures],
  };
}

function nearestPrice(
  asset: HistoricalPriceAsset,
  bucketTimestamp: number,
  prices: Array<{ timestamp: number; price: number }>,
): HistoricalPricePoint | null {
  const target = bucketTimestamp + PRICE_BUCKET_SECONDS / 2;
  let nearest: { timestamp: number; price: number } | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of prices) {
    const distance = Math.abs(candidate.timestamp - target);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  if (!nearest || nearestDistance > MAX_PRICE_DISTANCE_SECONDS) return null;
  return {
    asset,
    bucketTimestamp,
    priceUsd: nearest.price,
    providerTimestamp: nearest.timestamp,
  };
}

export async function getHistoricalPricesUsd(
  asset: HistoricalPriceAsset,
  timestamps: number[],
): Promise<Map<number, HistoricalPricePoint | null>> {
  return (await getHistoricalPricesUsdWithDiagnostics(asset, timestamps)).prices;
}

function pricingStatus(
  requestedTimestampCount: number,
  resolvedTimestampCount: number,
  providerRequestCount: number,
  providerFailureCount: number,
  providerResponded: boolean,
): HistoricalPricingStatus {
  if (requestedTimestampCount === 0) return "OK";
  if (providerRequestCount > 0 && !providerResponded && providerFailureCount === providerRequestCount) {
    return "UNAVAILABLE";
  }
  if (providerFailureCount > 0 && resolvedTimestampCount < requestedTimestampCount) return "PARTIAL";
  return "OK";
}

export async function getHistoricalPricesUsdWithDiagnostics(
  asset: HistoricalPriceAsset,
  timestamps: number[],
  options: HistoricalPriceLoadOptions = {},
): Promise<HistoricalPriceLoadResult> {
  const validTimestamps = timestamps.filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  const buckets = [...new Set(timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .map(historicalPriceBucket))].sort((a, b) => a - b);
  const result = new Map<number, HistoricalPricePoint | null>();
  const missing: number[] = [];
  const rangeRequests: Promise<SolRangeResult>[] = [];
  const fetchImpl = options.fetchImpl ?? fetch;

  for (const bucket of buckets) {
    const cached = getCachedPrice(asset, bucket);
    if (cached !== undefined) {
      result.set(bucket, cached);
    } else if (!pendingPriceRequests.has(cacheKey(asset, bucket))) {
      missing.push(bucket);
    }
  }

  let cursor = 0;
  while (cursor < missing.length) {
    const rangeStart = missing[cursor];
    const rangeEndLimit = rangeStart + MAX_RANGE_SECONDS;
    const rangeBuckets: number[] = [];
    while (cursor < missing.length && missing[cursor] <= rangeEndLimit) {
      rangeBuckets.push(missing[cursor]);
      cursor += 1;
    }

    const pricesRequest = fetchHistoricalSolRange(
      rangeBuckets[0] - PRICE_BUCKET_SECONDS,
      rangeBuckets[rangeBuckets.length - 1] + 2 * PRICE_BUCKET_SECONDS,
      fetchImpl,
    );
    rangeRequests.push(pricesRequest);
    for (const bucket of rangeBuckets) {
      const key = cacheKey(asset, bucket);
      const pending = pricesRequest
        .then((range) => {
          const point = nearestPrice(asset, bucket, range.prices);
          // Provider failure is infrastructure state, not a genuine historical
          // price miss. Never cache an outage as ordinary UNKNOWN data.
          if (range.providerResponded) setCachedPrice(asset, bucket, point);
          return point;
        })
        .finally(() => pendingPriceRequests.delete(key));
      pendingPriceRequests.set(key, pending);
    }
  }

  await Promise.all(buckets.map(async (bucket) => {
    if (result.has(bucket)) return;
    const key = cacheKey(asset, bucket);
    const pending = pendingPriceRequests.get(key);
    result.set(bucket, pending ? await pending : getCachedPrice(asset, bucket) ?? null);
  }));

  const ranges = await Promise.all(rangeRequests);
  const coinbaseRequestCount = ranges.reduce((sum, range) => sum + range.coinbaseRequestCount, 0);
  const coinbaseFailureCount = ranges.reduce((sum, range) => sum + range.coinbaseFailureCount, 0);
  const coingeckoRequestCount = ranges.reduce((sum, range) => sum + range.coingeckoRequestCount, 0);
  const coingeckoFailureCount = ranges.reduce((sum, range) => sum + range.coingeckoFailureCount, 0);
  const resolvedTimestampCount = validTimestamps.filter((timestamp) =>
    result.get(historicalPriceBucket(timestamp)) != null
  ).length;
  const resolvedBucketCount = buckets.filter((bucket) => result.get(bucket) != null).length;
  const providerRequestCount = coinbaseRequestCount + coingeckoRequestCount;
  const providerFailureCount = coinbaseFailureCount + coingeckoFailureCount;
  const providerResponded = ranges.some((range) => range.providerResponded)
    || (rangeRequests.length === 0 && [...result.values()].some((point) => point !== null));

  const failureCategories = ranges.flatMap((range) => range.failures).reduce<Partial<Record<HistoricalPricingFailureCategory, number>>>(
    (counts, category) => ({ ...counts, [category]: (counts[category] ?? 0) + 1 }),
    {},
  );

  return {
    prices: result,
    diagnostics: {
      status: pricingStatus(
        validTimestamps.length,
        resolvedTimestampCount,
        providerRequestCount,
        providerFailureCount,
        providerResponded,
      ),
      requestedTimestampCount: validTimestamps.length,
      resolvedTimestampCount,
      requestedBucketCount: buckets.length,
      resolvedBucketCount,
      coinbaseRequestCount,
      coinbaseFailureCount,
      coingeckoRequestCount,
      coingeckoFailureCount,
      ...(Object.keys(failureCategories).length > 0 ? { failureCategories } : {}),
    },
  };
}

export async function getHistoricalPriceUsd(
  asset: HistoricalPriceAsset,
  timestamp: number,
) {
  const prices = await getHistoricalPricesUsd(asset, [timestamp]);
  return prices.get(historicalPriceBucket(timestamp)) ?? null;
}

export type HistoricalPricingConnectivityProbe = {
  provider: "coinbase" | "coingecko";
  status: number | null;
  error: HistoricalPricingFailureCategory | null;
  elapsedMs: number;
  proxyEnvironmentAvailable: boolean;
  nodeUseEnvProxy: string | null;
  httpProxyAvailable: boolean;
  httpsProxyAvailable: boolean;
  noProxyAvailable: boolean;
  executor: "application-runtime" | "local-node-bridge";
};

/** Server-only operational probe. It intentionally returns no URLs or secrets. */
export async function diagnoseHistoricalPricingConnectivity(
  fetchImpl: typeof fetch = fetch,
): Promise<HistoricalPricingConnectivityProbe[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 2 * PRICE_BUCKET_SECONDS;
  const coinbaseUrl = new URL("https://api.exchange.coinbase.com/products/SOL-USD/candles");
  coinbaseUrl.searchParams.set("granularity", String(PRICE_BUCKET_SECONDS));
  coinbaseUrl.searchParams.set("start", new Date(from * 1000).toISOString());
  coinbaseUrl.searchParams.set("end", new Date(now * 1000).toISOString());
  const coingeckoUrl = new URL("/api/v3/coins/solana/market_chart/range", COINGECKO_ORIGIN);
  coingeckoUrl.searchParams.set("vs_currency", "usd");
  coingeckoUrl.searchParams.set("from", String(from));
  coingeckoUrl.searchParams.set("to", String(now));
  coingeckoUrl.searchParams.set("interval", "hourly");
  const environment = {
    proxyEnvironmentAvailable: Boolean(process.env.HTTP_PROXY || process.env.HTTPS_PROXY),
    nodeUseEnvProxy: process.env.NODE_USE_ENV_PROXY ?? null,
    httpProxyAvailable: Boolean(process.env.HTTP_PROXY),
    httpsProxyAvailable: Boolean(process.env.HTTPS_PROXY),
    noProxyAvailable: Boolean(process.env.NO_PROXY),
  };

  const probe = async (
    provider: HistoricalPricingConnectivityProbe["provider"],
    url: URL,
    headers?: HeadersInit,
  ): Promise<HistoricalPricingConnectivityProbe> => {
    const startedAt = Date.now();
    try {
      const response = await fetchProviderRequest(provider, from, now, url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      }, fetchImpl);
      const bridged = response.headers.get("x-pricing-executor") === "local-node-bridge";
      return {
        provider,
        status: response.status,
        error: response.ok ? null : categoryForResponse(response),
        elapsedMs: Date.now() - startedAt,
        ...(bridged ? {
          proxyEnvironmentAvailable: response.headers.get("x-pricing-http-proxy-available") === "true"
            || response.headers.get("x-pricing-https-proxy-available") === "true",
          nodeUseEnvProxy: response.headers.get("x-pricing-node-use-env-proxy"),
          httpProxyAvailable: response.headers.get("x-pricing-http-proxy-available") === "true",
          httpsProxyAvailable: response.headers.get("x-pricing-https-proxy-available") === "true",
          noProxyAvailable: response.headers.get("x-pricing-no-proxy-available") === "true",
          executor: "local-node-bridge" as const,
        } : { ...environment, executor: "application-runtime" as const }),
      };
    } catch (error) {
      return {
        provider,
        status: null,
        error: categoryForError(error),
        elapsedMs: Date.now() - startedAt,
        ...environment,
        executor: "application-runtime",
      };
    }
  };

  return Promise.all([
    probe("coinbase", coinbaseUrl, { "User-Agent": "web3rpg-wallet-analysis/1.0" }),
    probe("coingecko", coingeckoUrl, process.env.COINGECKO_API_KEY
      ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY }
      : undefined),
  ]);
}

export const HISTORICAL_PRICE_BUCKET_SECONDS = PRICE_BUCKET_SECONDS;
