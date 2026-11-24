import type { TokenHolding } from "./types";
import { mapWithConcurrency } from "../solana/concurrency";
import type { HoldingPeriod, TokenLedger, TradeLeg, WalletBehaviorProfile } from "./behaviorTypes";
import {
  getTokenHistoricalPricesUsd,
  isTokenHistoricalPriceProviderConfigured,
  tokenPriceBucket,
  TOKEN_HISTORICAL_PRICE_MAX_REQUESTS_PER_WALLET,
  type TokenHistoricalPriceBudget,
  type TokenHistoricalPriceResult,
} from "../pricing/tokenHistoricalPrice";

export type PeakConfidence = "LOW" | "MEDIUM" | "HIGH";
export type PositionPriceConfidence = "LOW" | "HIGH";
export type PositionPriceReason =
  | "NO_PROVIDER_PRICE"
  | "UNSUPPORTED_TOKEN"
  | "UNKNOWN_COST_BASIS"
  | "PARTIAL_HISTORY"
  | "DUST_POSITION"
  | "OTHER";

export type PositionPerformance = {
  id: string;
  mint: string;
  symbol?: string;
  status: "OPEN" | "CLOSED";
  openedAt: number;
  closedAt: number | null;
  entryValueUsd: number | null;
  exitValueUsd: number | null;
  currentValueUsd: number | null;
  currentAmount: number | null;
  unrealizedPnlUsd: number | null;
  peakValueUsd: number | null;
  entryPriceUsd: number | null;
  exitPriceUsd: number | null;
  currentPriceUsd: number | null;
  peakPriceUsd: number | null;
  /** Timestamp of the sampled historical price used as the verified peak. */
  peakTimestamp?: number | null;
  /** Timestamp represented by the closed or current outcome valuation. */
  outcomeTimestamp?: number;
  peakReturnPct: number | null;
  realizedReturnPct: number | null;
  unrealizedReturnPct: number | null;
  givebackPct: number | null;
  holdingDuration: number | null;
  priceCoverage: number;
  peakConfidence: PeakConfidence;
  sampleCount: number;
  requestedSampleCount: number;
  priceConfidence: PositionPriceConfidence;
  priceReason: PositionPriceReason | null;
};

export type PositionPricingCostReport = {
  positionsAvailable: number;
  positionsConsidered: number;
  priceBucketsRequested: number;
  cacheHits: number;
  cacheHitRate: number;
  externalRequests: number;
  estimatedColdCacheRequests: number;
  unpricedPositions: number;
  requestLimitReached: boolean;
  providerAvailable: boolean;
  providerStatusReason: "NO_API_KEY" | null;
  maxExternalRequests: number;
  historicalPriceEligibleEpisodes: number;
  historicalPricePricedEpisodes: number;
  historicalPriceCoverage: number;
  providerFailures: number;
  unsupportedTokens: number;
};

export type PositionPerformanceSummary = {
  positions: PositionPerformance[];
  openPositions: number;
  closedPositions: number;
  costReport: PositionPricingCostReport;
};

type PriceResolver = (
  mint: string,
  timestamps: number[],
  options: { budget: TokenHistoricalPriceBudget },
) => Promise<TokenHistoricalPriceResult>;

export type PositionPerformanceOptions = {
  asOfTimestamp?: number;
  maxPositions?: number;
  maxSamplesPerPosition?: number;
  maxExternalRequests?: number;
  priceResolver?: PriceResolver;
  historyComplete?: boolean;
};

const TOKEN_PRICE_RANGE_SECONDS = 365 * 86_400;

function estimatedTokenPriceRanges(timestamps: number[]): number {
  const sorted = [...new Set(timestamps)].sort((a, b) => a - b);
  let ranges = 0;
  let cursor = 0;
  while (cursor < sorted.length) {
    const start = sorted[cursor];
    ranges += 1;
    cursor += 1;
    while (cursor < sorted.length && sorted[cursor] - start <= TOKEN_PRICE_RANGE_SECONDS) cursor += 1;
  }
  return ranges;
}

type Episode = {
  id: string;
  ledger: TokenLedger;
  period: HoldingPeriod;
  events: TradeLeg[];
};

const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;
const DEFAULT_MAX_POSITIONS = 24;
const DEFAULT_MAX_SAMPLES = 400;
const MIN_PEAK_COVERAGE = 0.75;
const MIN_PEAK_SAMPLES = 3;

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function eventsForPeriods(ledger: TokenLedger): Episode[] {
  const episodes: Episode[] = [];
  let cursor = 0;
  for (const [index, period] of ledger.holdingPeriods.entries()) {
    if (period.openingStateUnknown) continue;
    const start = ledger.events.findIndex((event, eventIndex) =>
      eventIndex >= cursor
      && event.timestamp === period.openedAt
      && (event.eventType === "BUY" || event.eventType === "RE_ENTRY")
    );
    if (start < 0) continue;
    let end = ledger.events.length - 1;
    if (period.closedAt !== undefined) {
      const relativeEnd = ledger.events.slice(start).findIndex((event) =>
        event.eventType === "EXIT" && event.timestamp === period.closedAt
      );
      if (relativeEnd < 0) continue;
      end = start + relativeEnd;
    }
    cursor = end + 1;
    episodes.push({
      id: `${ledger.mint}:${period.openedAt}:${index}`,
      ledger,
      period,
      events: ledger.events.slice(start, end + 1),
    });
  }
  return episodes;
}

function weightedExecution(events: TradeLeg[], side: "BUY" | "SELL") {
  const matching = events.filter((event) => event.side === side);
  if (matching.length === 0 || matching.some((event) => event.usdValue === undefined)) {
    return { value: null, price: null };
  }
  const amount = matching.reduce((sum, event) => sum + event.amount, 0);
  const value = matching.reduce((sum, event) => sum + Math.abs(event.usdValue ?? 0), 0);
  return {
    value: finitePositive(value) ? value : null,
    price: finitePositive(amount) && finitePositive(value) ? value / amount : null,
  };
}

function intervalFor(duration: number) {
  if (duration < DAY_SECONDS) return HOUR_SECONDS;
  if (duration < 7 * DAY_SECONDS) return 4 * HOUR_SECONDS;
  return DAY_SECONDS;
}

function sampleTimestamps(openedAt: number, endedAt: number, maximum: number) {
  const duration = Math.max(0, endedAt - openedAt);
  const interval = intervalFor(duration);
  const samples = [openedAt];
  for (let timestamp = openedAt + interval; timestamp < endedAt; timestamp += interval) {
    samples.push(timestamp);
    if (samples.length > maximum) return [];
  }
  if (endedAt > openedAt) samples.push(endedAt);
  return samples.length <= maximum ? samples : [];
}

function estimatedRangeRequests(samplesByMint: Map<string, number[]>) {
  let requests = 0;
  for (const timestamps of samplesByMint.values()) {
    const buckets = [...new Set(timestamps.map(tokenPriceBucket))].sort((a, b) => a - b);
    let cursor = 0;
    while (cursor < buckets.length) {
      const start = buckets[cursor];
      requests += 1;
      cursor += 1;
      while (cursor < buckets.length && buckets[cursor] - start <= 365 * DAY_SECONDS) {
        cursor += 1;
      }
    }
  }
  return requests;
}

function quantityAt(events: TradeLeg[], timestamp: number) {
  return Math.max(0, events.reduce((quantity, event) => {
    if (event.timestamp > timestamp) return quantity;
    return quantity + (event.side === "BUY" ? event.amount : -event.amount);
  }, 0));
}

function currentPrice(holding: TokenHolding | undefined) {
  if (!holding || !finitePositive(holding.amount) || !finitePositive(holding.usdValue)) return null;
  return holding.usdValue / holding.amount;
}

function confidence(coverage: number, sampleCount: number): PeakConfidence {
  if (coverage >= 0.9 && sampleCount >= 8) return "HIGH";
  if (coverage >= MIN_PEAK_COVERAGE && sampleCount >= MIN_PEAK_SAMPLES) return "MEDIUM";
  return "LOW";
}

function safeReturn(finalPrice: number | null, entryPrice: number | null) {
  return finalPrice !== null && entryPrice !== null && entryPrice > 0
    ? finalPrice / entryPrice - 1
    : null;
}

function makeBase(
  episode: Episode,
  holding: TokenHolding | undefined,
  asOfTimestamp: number,
) {
  const entry = weightedExecution(episode.events, "BUY");
  const exit = weightedExecution(episode.events, "SELL");
  const isOpen = episode.period.closedAt === undefined;
  const current = isOpen ? currentPrice(holding) : null;
  const currentAmount = isOpen ? quantityAt(episode.events, asOfTimestamp) : 0;
  const end = episode.period.closedAt ?? asOfTimestamp;
  return {
    entry,
    exit: isOpen ? { value: null, price: null } : exit,
    current,
    currentAmount,
    isOpen,
    end,
    holdingDuration: end >= episode.period.openedAt ? end - episode.period.openedAt : null,
  };
}

export async function buildPositionPerformance(
  profile: WalletBehaviorProfile,
  holdings: TokenHolding[],
  options: PositionPerformanceOptions = {},
): Promise<PositionPerformanceSummary> {
  const latestEvent = profile.ledgers.reduce((latest, ledger) => Math.max(latest, ledger.lastTradeAt), 0);
  const asOfTimestamp = options.asOfTimestamp ?? Math.max(Math.floor(Date.now() / 1000), latestEvent);
  const maxPositions = options.maxPositions ?? DEFAULT_MAX_POSITIONS;
  const maxSamples = options.maxSamplesPerPosition ?? DEFAULT_MAX_SAMPLES;
  const episodes = profile.ledgers.flatMap(eventsForPeriods);
  const holdingsByMint = new Map(holdings.map((holding) => [holding.mint, holding]));

  // Prefer economically meaningful and open episodes when the safety cap is hit.
  const historicallyEligible = episodes.filter((episode) => {
    const base = makeBase(episode, holdingsByMint.get(episode.ledger.mint), asOfTimestamp);
    const finalPrice = base.isOpen ? base.current : base.exit.price;
    return base.entry.price !== null && finalPrice !== null;
  });
  const peakCandidates = historicallyEligible.slice().sort((left, right) => {
    const leftBase = makeBase(left, holdingsByMint.get(left.ledger.mint), asOfTimestamp);
    const rightBase = makeBase(right, holdingsByMint.get(right.ledger.mint), asOfTimestamp);
    if (leftBase.isOpen !== rightBase.isOpen) return leftBase.isOpen ? -1 : 1;
    return (rightBase.entry.value ?? 0) - (leftBase.entry.value ?? 0);
  }).slice(0, maxPositions);

  const sampleMap = new Map<string, number[]>();
  const samplesByMint = new Map<string, number[]>();
  for (const episode of peakCandidates) {
    const base = makeBase(episode, holdingsByMint.get(episode.ledger.mint), asOfTimestamp);
    const samples = sampleTimestamps(episode.period.openedAt, base.end, maxSamples);
    sampleMap.set(episode.id, samples);
    samplesByMint.set(episode.ledger.mint, [
      ...(samplesByMint.get(episode.ledger.mint) ?? []),
      ...samples,
    ]);
  }

  const budget: TokenHistoricalPriceBudget = {
    externalRequests: 0,
    maxExternalRequests: options.maxExternalRequests
      ?? TOKEN_HISTORICAL_PRICE_MAX_REQUESTS_PER_WALLET,
  };
  const resolver = options.priceResolver ?? getTokenHistoricalPricesUsd;
  const pricesByMint = new Map<string, TokenHistoricalPriceResult>();
  let requestedBuckets = 0;
  let cacheHits = 0;
  let externalRequests = 0;
  let providerAvailable = options.priceResolver
    ? true
    : isTokenHistoricalPriceProviderConfigured();
  let requestLimitReached = false;
  let providerFailures = 0;
  const unsupportedTokens = new Set<string>();

  const sampleEntries = [...samplesByMint.entries()];
  const estimatedRanges = sampleEntries.reduce(
    (sum, [, timestamps]) => sum + estimatedTokenPriceRanges(timestamps),
    0,
  );
  // Parallelize only when the budget can cover a retry for every planned
  // range. Near the hard cap, serial order is retained so provider timing can
  // never decide which mint receives the remaining evidence budget.
  const tokenPriceConcurrency = estimatedRanges * 2 <= budget.maxExternalRequests ? 3 : 1;
  const priceEntries = await mapWithConcurrency(
    sampleEntries,
    tokenPriceConcurrency,
    async ([mint, timestamps]) => ({
      mint,
      result: await resolver(mint, timestamps, { budget }),
    }),
  );
  // mapWithConcurrency preserves input order, so all result aggregation and
  // downstream position selection remain deterministic.
  for (const { mint, result } of priceEntries) {
    pricesByMint.set(mint, result);
    requestedBuckets += result.stats.requestedBuckets;
    cacheHits += result.stats.cacheHits;
    externalRequests += result.stats.externalRequests;
    providerAvailable = providerAvailable && result.stats.providerAvailable;
    requestLimitReached = requestLimitReached || result.stats.requestLimitReached;
    providerFailures += result.stats.providerFailures;
    if (result.stats.unsupportedToken) unsupportedTokens.add(mint);
  }

  // Execution/current performance remains available for every reliable episode.
  // Only historical peak sampling is capped.
  const positions = episodes.map((episode): PositionPerformance => {
    const base = makeBase(episode, holdingsByMint.get(episode.ledger.mint), asOfTimestamp);
    const requested = sampleMap.get(episode.id) ?? [];
    const resolved = requested.flatMap((timestamp) => {
      const point = pricesByMint.get(episode.ledger.mint)?.prices.get(tokenPriceBucket(timestamp));
      return point ? [{ timestamp, priceUsd: point.priceUsd }] : [];
    });
    const coverage = requested.length > 0 ? resolved.length / requested.length : 0;
    const peakConfidence = confidence(coverage, resolved.length);
    const peakEligible = coverage >= MIN_PEAK_COVERAGE && resolved.length >= MIN_PEAK_SAMPLES;
    const peak = peakEligible && resolved.length > 0
      ? resolved.reduce((best, point) => point.priceUsd > best.priceUsd ? point : best)
      : null;
    const peakPrice = peak?.priceUsd ?? null;
    const peakQuantity = peak ? quantityAt(episode.events, peak.timestamp) : null;
    const peakValue = peakPrice !== null && peakQuantity !== null
      ? peakPrice * peakQuantity
      : null;
    const finalPrice = base.isOpen ? base.current : base.exit.price;
    const peakReturn = safeReturn(peakPrice, base.entry.price);
    const giveback = peakPrice !== null
      && base.entry.price !== null
      && finalPrice !== null
      && peakPrice > base.entry.price
      ? (peakPrice - finalPrice) / (peakPrice - base.entry.price)
      : null;
    const holding = holdingsByMint.get(episode.ledger.mint);
    const entryKnown = base.entry.price !== null && base.entry.value !== null;
    const dust = base.currentAmount <= 1e-9 || (base.entry.value !== null && base.entry.value < 0.01);
    const priceReason: PositionPriceReason | null = !base.isOpen
      ? null
      : !entryKnown
        ? "UNKNOWN_COST_BASIS"
        : base.current !== null
          ? null
          : dust
            ? "DUST_POSITION"
            : !holding && !(options.historyComplete ?? false)
              ? "PARTIAL_HISTORY"
              : holding
                ? "NO_PROVIDER_PRICE"
                : "OTHER";

    return {
      id: episode.id,
      mint: episode.ledger.mint,
      ...(episode.ledger.symbol ? { symbol: episode.ledger.symbol } : {}),
      status: base.isOpen ? "OPEN" : "CLOSED",
      openedAt: episode.period.openedAt,
      closedAt: episode.period.closedAt ?? null,
      entryValueUsd: base.entry.value,
      exitValueUsd: base.exit.value,
      currentValueUsd: base.current !== null ? base.current * base.currentAmount : null,
      currentAmount: base.isOpen ? base.currentAmount : null,
      unrealizedPnlUsd: base.isOpen && base.current !== null && base.entry.price !== null
        ? base.currentAmount * (base.current - base.entry.price)
        : null,
      peakValueUsd: peakValue,
      entryPriceUsd: base.entry.price,
      exitPriceUsd: base.exit.price,
      currentPriceUsd: base.current,
      peakPriceUsd: peakPrice,
      peakTimestamp: peak?.timestamp ?? null,
      outcomeTimestamp: base.end,
      peakReturnPct: peakReturn,
      realizedReturnPct: base.isOpen ? null : safeReturn(base.exit.price, base.entry.price),
      unrealizedReturnPct: base.isOpen ? safeReturn(base.current, base.entry.price) : null,
      givebackPct: giveback,
      holdingDuration: base.holdingDuration,
      priceCoverage: coverage,
      peakConfidence,
      sampleCount: resolved.length,
      requestedSampleCount: requested.length,
      priceConfidence: entryKnown && (!base.isOpen || base.current !== null) ? "HIGH" : "LOW",
      priceReason,
    };
  }).sort((left, right) => left.openedAt - right.openedAt || left.id.localeCompare(right.id));

  return {
    positions,
    openPositions: positions.filter((position) => position.status === "OPEN").length,
    closedPositions: positions.filter((position) => position.status === "CLOSED").length,
    costReport: {
      positionsAvailable: episodes.length,
      positionsConsidered: peakCandidates.length,
      priceBucketsRequested: requestedBuckets,
      cacheHits,
      cacheHitRate: requestedBuckets > 0 ? cacheHits / requestedBuckets : 0,
      externalRequests,
      estimatedColdCacheRequests: Math.min(
        estimatedRangeRequests(samplesByMint),
        budget.maxExternalRequests,
      ),
      unpricedPositions: positions.filter((position) => position.peakPriceUsd === null).length,
      requestLimitReached,
      providerAvailable,
      providerStatusReason: providerAvailable ? null : "NO_API_KEY",
      maxExternalRequests: budget.maxExternalRequests,
      historicalPriceEligibleEpisodes: historicallyEligible.length,
      historicalPricePricedEpisodes: positions.filter((position) => position.peakPriceUsd !== null).length,
      historicalPriceCoverage: historicallyEligible.length > 0
        ? positions.filter((position) => position.peakPriceUsd !== null).length / historicallyEligible.length
        : 0,
      providerFailures,
      unsupportedTokens: unsupportedTokens.size,
    },
  };
}
