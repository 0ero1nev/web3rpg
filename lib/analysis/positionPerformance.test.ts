import assert from "node:assert/strict";
import test from "node:test";
import { buildWalletBehaviorProfile } from "./behaviorFeatures";
import { buildPositionPerformance, type PositionPerformanceSummary } from "./positionPerformance";
import { analyzeTradeSequences } from "./tradeSequences";
import type { NormalizedTransaction } from "./types";
import { tokenPriceBucket, type TokenHistoricalPriceResult } from "../pricing/tokenHistoricalPrice";
import { scorePersonas } from "../persona/personaScoring";

const START = 1_700_000_000;

function trade(
  signature: string,
  timestamp: number,
  side: "BUY" | "SELL",
  tokenValue: number,
): NormalizedTransaction {
  const tokenDirection = side === "BUY" ? "IN" : "OUT";
  return {
    signature,
    timestamp,
    type: "SWAP",
    tokenChanges: [
      { mint: "USDC", symbol: "USDC", amount: tokenValue, usdValue: tokenValue, direction: side === "BUY" ? "OUT" : "IN" },
      { mint: "token", symbol: "TOKEN", amount: 10, usdValue: tokenValue, direction: tokenDirection },
    ],
  };
}

function resolver(prices: Map<number, number>) {
  return async (_mint: string, timestamps: number[]): Promise<TokenHistoricalPriceResult> => ({
    prices: new Map(timestamps.map((timestamp) => {
      const bucket = tokenPriceBucket(timestamp);
      const priceUsd = prices.get(bucket);
      return [bucket, priceUsd === undefined ? null : {
        mint: "token",
        bucketTimestamp: bucket,
        priceUsd,
        providerTimestamp: bucket,
        provider: "COINGECKO" as const,
      }];
    })),
    stats: {
      requestedBuckets: new Set(timestamps.map(tokenPriceBucket)).size,
      cacheHits: 0,
      externalRequests: 1,
      providerAvailable: true,
      requestLimitReached: false,
      providerFailures: 0,
      unsupportedToken: false,
      failureReason: null,
    },
  });
}

test("position lifecycle derives execution returns and a covered historical peak", async () => {
  const behavior = buildWalletBehaviorProfile([
    trade("buy", START, "BUY", 100),
    trade("sell", START + 2 * 3_600, "SELL", 170),
  ], { historyComplete: true });
  const prices = new Map([
    [tokenPriceBucket(START), 10],
    [tokenPriceBucket(START + 3_600), 90],
    [tokenPriceBucket(START + 2 * 3_600), 17],
  ]);
  const performance = await buildPositionPerformance(behavior, [], {
    asOfTimestamp: START + 2 * 3_600,
    priceResolver: resolver(prices),
  });
  const position = performance.positions[0];
  assert.equal(position.entryValueUsd, 100);
  assert.equal(position.exitValueUsd, 170);
  assert.equal(position.peakValueUsd, 900);
  assert.equal(position.peakTimestamp, START + 3_600);
  assert.equal(position.outcomeTimestamp, START + 2 * 3_600);
  assert.equal(position.peakReturnPct, 8);
  assert.ok(Math.abs((position.givebackPct ?? 0) - 0.9125) < 1e-10);
  assert.equal(position.priceCoverage, 1);
  assert.equal(position.peakConfidence, "MEDIUM");
});

test("current holding price values an open episode but never creates a historical peak", async () => {
  const behavior = buildWalletBehaviorProfile([trade("buy", START, "BUY", 100)], {
    historyComplete: true,
  });
  const performance = await buildPositionPerformance(
    behavior,
    [{ mint: "token", amount: 10, usdValue: 400 }],
    {
      asOfTimestamp: START + 10 * 86_400,
      priceResolver: resolver(new Map()),
    },
  );
  const position = performance.positions[0];
  assert.equal(position.currentPriceUsd, 40);
  assert.equal(position.currentValueUsd, 400);
  assert.equal(position.unrealizedReturnPct, 3);
  assert.equal(position.peakPriceUsd, null);
  assert.equal(position.peakValueUsd, null);

  const ranking = scorePersonas(behavior, { historyComplete: true, positionPerformance: performance });
  assert.equal(ranking.scores.find((item) => item.personaId === "midas")?.eligible, true);
  assert.equal(ranking.scores.find((item) => item.personaId === "icarus")?.eligible, false);
  assert.equal(ranking.scores.find((item) => item.personaId === "icarus")?.score, null);
});

test("historical prices for independent mints resolve concurrently with deterministic output", async () => {
  const transactions = ["alpha", "beta", "gamma"].flatMap((mint, index) => [
    {
      ...trade(`${mint}-buy`, START + index * 10, "BUY", 100),
      tokenChanges: [
        { mint: "USDC", symbol: "USDC", amount: 100, usdValue: 100, direction: "OUT" as const },
        { mint, symbol: mint.toUpperCase(), amount: 10, usdValue: 100, direction: "IN" as const },
      ],
    },
    {
      ...trade(`${mint}-sell`, START + 3_600 + index * 10, "SELL", 120),
      tokenChanges: [
        { mint: "USDC", symbol: "USDC", amount: 120, usdValue: 120, direction: "IN" as const },
        { mint, symbol: mint.toUpperCase(), amount: 10, usdValue: 120, direction: "OUT" as const },
      ],
    },
  ]);
  const behavior = buildWalletBehaviorProfile(transactions, { historyComplete: true });
  let inFlight = 0;
  let peak = 0;
  const performance = await buildPositionPerformance(behavior, [], {
    asOfTimestamp: START + 3_600,
    priceResolver: async (mint, timestamps, { budget }) => {
      budget.externalRequests += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return {
        prices: new Map(timestamps.map((timestamp) => {
          const bucket = tokenPriceBucket(timestamp);
          return [bucket, {
            mint,
            bucketTimestamp: bucket,
            priceUsd: 11,
            providerTimestamp: bucket,
            provider: "COINGECKO" as const,
          }];
        })),
        stats: {
          requestedBuckets: timestamps.length,
          cacheHits: 0,
          externalRequests: 1,
          providerAvailable: true,
          requestLimitReached: false,
          providerFailures: 0,
          unsupportedToken: false,
          failureReason: null,
        },
      };
    },
  });
  assert.equal(peak, 3);
  assert.deepEqual(performance.positions.map((position) => position.mint), ["alpha", "beta", "gamma"]);
  assert.equal(performance.costReport.externalRequests, 3);
});

function sequencePosition(
  id: string,
  openedAt: number,
  entryValueUsd: number,
  realizedReturnPct: number,
): PositionPerformanceSummary["positions"][number] {
  return {
    id, mint: id, status: "CLOSED", openedAt, closedAt: openedAt + 1,
    entryValueUsd, exitValueUsd: entryValueUsd * (1 + realizedReturnPct),
    currentValueUsd: null, peakValueUsd: null,
    currentAmount: null, unrealizedPnlUsd: null,
    entryPriceUsd: 1, exitPriceUsd: 1 + realizedReturnPct,
    currentPriceUsd: null, peakPriceUsd: null, peakReturnPct: null,
    realizedReturnPct, unrealizedReturnPct: null, givebackPct: null,
    holdingDuration: 1, priceCoverage: 0, peakConfidence: "LOW",
    sampleCount: 0, requestedSampleCount: 0,
    priceConfidence: "HIGH", priceReason: null,
  };
}

test("Napoleon requires wins, size expansion, and a subsequent large loss", () => {
  const summary: PositionPerformanceSummary = {
    positions: [
      sequencePosition("win-1", 1, 100, 0.2),
      sequencePosition("win-2", 2, 120, 0.3),
      sequencePosition("loss", 3, 330, -0.6),
    ],
    openPositions: 0,
    closedPositions: 3,
    costReport: {
      positionsAvailable: 3, positionsConsidered: 3, priceBucketsRequested: 0,
      cacheHits: 0, cacheHitRate: 0, externalRequests: 0, unpricedPositions: 3,
      estimatedColdCacheRequests: 0,
      requestLimitReached: false, providerAvailable: false, maxExternalRequests: 20,
      providerStatusReason: "NO_API_KEY",
      historicalPriceEligibleEpisodes: 0, historicalPricePricedEpisodes: 0,
      historicalPriceCoverage: 0, providerFailures: 0, unsupportedTokens: 0,
    },
  };
  const sequences = analyzeTradeSequences(summary);
  assert.equal(sequences.winningStreakLength, 2);
  assert.equal(sequences.positionSizeExpansionRatio, 3);
  assert.equal(sequences.overextensionEvents, 1);

  const behavior = buildWalletBehaviorProfile([], { historyComplete: true });
  const napoleon = scorePersonas(behavior, {
    historyComplete: true,
    positionPerformance: summary,
    tradeSequences: sequences,
  }).scores.find((item) => item.personaId === "napoleon");
  assert.equal(napoleon?.eligible, true);
});

test("Napoleon rejects an expanded loss opened before prior wins were realized", () => {
  const first = sequencePosition("win-1", 1, 100, 0.2);
  const second = sequencePosition("win-2", 2, 120, 0.3);
  const loss = sequencePosition("loss", 3, 330, -0.6);
  first.closedAt = 10;
  second.closedAt = 11;
  loss.closedAt = 12;
  const summary: PositionPerformanceSummary = {
    positions: [first, second, loss],
    openPositions: 0,
    closedPositions: 3,
    costReport: {
      positionsAvailable: 3, positionsConsidered: 3, priceBucketsRequested: 0,
      cacheHits: 0, cacheHitRate: 0, externalRequests: 0,
      estimatedColdCacheRequests: 0, unpricedPositions: 3,
      requestLimitReached: false, providerAvailable: false, maxExternalRequests: 20,
      providerStatusReason: "NO_API_KEY",
      historicalPriceEligibleEpisodes: 0, historicalPricePricedEpisodes: 0,
      historicalPriceCoverage: 0, providerFailures: 0, unsupportedTokens: 0,
    },
  };
  assert.equal(analyzeTradeSequences(summary).overextensionEvents, 0);
});
