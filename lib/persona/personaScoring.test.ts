import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedTransaction } from "../analysis/types";
import type { PositionPerformanceSummary } from "../analysis/positionPerformance";
import { buildWalletBehaviorProfile } from "../analysis/behaviorFeatures";
import { logCountScore, logRangeScore } from "./behaviorScores";
import { MIN_WINNING_MATCH, REQUIRED_QUALIFYING_SWAPS, resolvePersonaOutcome, scorePersonas, weightedValue } from "./personaScoring";
import type { BehaviorScore } from "./personaTypes";

function dimension(value: number | null): BehaviorScore {
  return { value, confidence: 50, sampleSize: 1, evidence: [] };
}

function swap(signature: string, timestamp: number, direction: "IN" | "OUT", usd: number | undefined): NormalizedTransaction {
  return {
    signature,
    timestamp,
    type: "SWAP",
    tokenChanges: [
      { mint: "SOL", symbol: "SOL", amount: 1, direction: direction === "IN" ? "OUT" : "IN", ...(usd === undefined ? {} : { usdValue: usd }) },
      { mint: "token", symbol: "TOKEN", amount: 10, direction, ...(usd === undefined ? {} : { usdValue: usd }) },
    ],
    valuation: {
      signature, timestamp, usdValue: usd ?? null,
      inputPriceUsd: usd ?? null, outputPriceUsd: usd ?? null,
      source: usd === undefined ? "UNKNOWN" : "SOL_HISTORICAL_PRICE",
      confidence: usd === undefined ? "LOW" : "MEDIUM",
    },
  };
}

function newtonFixture(higher: boolean) {
  const prices = higher ? [100, 160, 220, 300] : [100, 70, 45, 25];
  const transactions: NormalizedTransaction[] = [swap("buy-0", 1_000, "IN", prices[0])];
  for (let index = 0; index < 3; index += 1) {
    transactions.push(swap(`sell-${index}`, 1_001 + index * 2, "OUT", prices[index]));
    transactions.push(swap(`buy-${index + 1}`, 1_002 + index * 2, "IN", prices[index + 1]));
  }
  transactions.push(swap("sell-final", 1_007, "OUT", prices[3]));
  transactions.push(swap("buy-final", 1_008, "IN", prices[3]));
  transactions.push(swap("add-1", 1_009, "IN", prices[3]));
  transactions.push(swap("add-2", 1_010, "IN", prices[3]));
  return buildWalletBehaviorProfile(transactions, { historyComplete: true });
}

test("normalization functions are bounded and logarithmic", () => {
  assert.equal(logCountScore(0, 1_000), 0);
  assert.equal(logCountScore(1_000, 1_000), 100);
  assert.ok(logCountScore(100, 1_000) > logCountScore(10, 1_000));
  assert.equal(logRangeScore(10, 10, 100_000), 0);
  assert.equal(logRangeScore(100_000, 10, 100_000), 100);
});

test("Newton strongly prefers repeated higher-price reentries", () => {
  const higher = scorePersonas(newtonFixture(true), { historyComplete: true });
  const lower = scorePersonas(newtonFixture(false), { historyComplete: true });
  const higherNewton = higher.scores.find((persona) => persona.personaId === "newton");
  const lowerNewton = lower.scores.find((persona) => persona.personaId === "newton");
  assert.equal(higherNewton?.eligible, true);
  assert.equal(lowerNewton?.eligible, true);
  assert.ok((higherNewton?.score ?? 0) > (lowerNewton?.score ?? 0) + 20);
  assert.equal(higherNewton?.evidence.find((item) => item.label === "HIGHER-PRICE REENTRIES")?.value, "3 / 4");
});

test("missing prices stay unknown and prevent Newton eligibility", () => {
  const transactions = Array.from({ length: 12 }, (_, index) =>
    swap(`unknown-${index}`, 1_000 + index, index % 2 === 0 ? "IN" : "OUT", undefined)
  );
  const ranking = scorePersonas(
    buildWalletBehaviorProfile(transactions, { historyComplete: true }),
    { historyComplete: true },
  );
  const newton = ranking.scores.find((persona) => persona.personaId === "newton");
  assert.equal(ranking.dimensions.FOMO_REENTRY.value, null);
  assert.equal(ranking.dimensions.EFFICIENCY.value, null);
  assert.equal(newton?.eligible, false);
  assert.ok(newton?.missingEvidence.includes("At least 2 priced exit/re-entry pairs"));
});

function unpricedProfile(swapCount: number) {
  const transactions = Array.from({ length: swapCount }, (_, index) =>
    swap(`unknown-${index}`, 1_000 + index, index % 2 === 0 ? "IN" : "OUT", undefined)
  );
  return buildWalletBehaviorProfile(transactions, { historyComplete: true });
}

function donQuixoteSummary(positions: Array<{ returnPct: number; days: number }>): PositionPerformanceSummary {
  return {
    positions: positions.map((position, index) => ({
      id: `pos-${index}`,
      mint: `mint-${index}`,
      status: "OPEN",
      openedAt: 1_000,
      closedAt: null,
      entryValueUsd: 100,
      exitValueUsd: null,
      currentValueUsd: 100 * (1 + position.returnPct),
      currentAmount: 10,
      unrealizedPnlUsd: null,
      peakValueUsd: null,
      entryPriceUsd: 10,
      exitPriceUsd: null,
      currentPriceUsd: 10 * (1 + position.returnPct),
      peakPriceUsd: null,
      peakReturnPct: null,
      realizedReturnPct: null,
      unrealizedReturnPct: position.returnPct,
      givebackPct: null,
      holdingDuration: position.days * 86_400,
      priceCoverage: 1,
      peakConfidence: "LOW",
      sampleCount: 0,
      requestedSampleCount: 0,
      priceConfidence: "HIGH",
      priceReason: null,
    })),
    openPositions: positions.length,
    closedPositions: 0,
    costReport: {
      positionsAvailable: positions.length,
      positionsConsidered: 0,
      priceBucketsRequested: 0,
      cacheHits: 0,
      cacheHitRate: 0,
      externalRequests: 0,
      estimatedColdCacheRequests: 0,
      unpricedPositions: 0,
      requestLimitReached: false,
      providerAvailable: false,
      providerStatusReason: "NO_API_KEY",
      maxExternalRequests: 20,
      historicalPriceEligibleEpisodes: 0,
      historicalPricePricedEpisodes: 0,
      historicalPriceCoverage: 0,
      providerFailures: 0,
      unsupportedTokens: 0,
    },
  };
}

function donQuixoteScore(ranking: ReturnType<typeof scorePersonas>) {
  const score = ranking.scores.find((persona) => persona.personaId === "don_quixote");
  assert.ok(score, "don_quixote score missing");
  return score;
}

test("Don Quixote scores continuous loss x persistence", () => {
  const profile = unpricedProfile(12);
  const mildLossLongHold = scorePersonas(profile, {
    historyComplete: true,
    positionPerformance: donQuixoteSummary([{ returnPct: -0.10, days: 100 }]),
  });
  const severeLossShortHold = scorePersonas(profile, {
    historyComplete: true,
    positionPerformance: donQuixoteSummary([{ returnPct: -0.90, days: 1 }]),
  });
  const severeLossHeld = scorePersonas(profile, {
    historyComplete: true,
    positionPerformance: donQuixoteSummary([{ returnPct: -0.90, days: 45 }]),
  });
  const extremeLossVeryLongHold = scorePersonas(profile, {
    historyComplete: true,
    positionPerformance: donQuixoteSummary([{ returnPct: -0.95, days: 180 }]),
  });
  assert.ok((donQuixoteScore(mildLossLongHold).match ?? 0) < MIN_WINNING_MATCH);
  assert.ok((donQuixoteScore(severeLossShortHold).match ?? 0) < MIN_WINNING_MATCH);
  assert.ok((donQuixoteScore(severeLossHeld).match ?? 0) >= 75);
  assert.ok((donQuixoteScore(extremeLossVeryLongHold).match ?? 0) >= 90);
  assert.ok((donQuixoteScore(extremeLossVeryLongHold).match ?? 0)
    > (donQuixoteScore(severeLossHeld).match ?? 0));
  assert.ok((donQuixoteScore(severeLossHeld).match ?? 0)
    > (donQuixoteScore(severeLossShortHold).match ?? 0));
});

test("an eligible Persona with a low Match cannot win", () => {
  const ranking = scorePersonas(unpricedProfile(12), {
    historyComplete: true,
    positionPerformance: donQuixoteSummary([{ returnPct: -0.10, days: 100 }]),
  });
  assert.equal(donQuixoteScore(ranking)?.eligible, true);
  assert.ok((donQuixoteScore(ranking)?.match ?? 0) < MIN_WINNING_MATCH);
  assert.equal(ranking.winner, null);
  assert.equal(ranking.resultReason, "NO_STRONG_MATCH");
});

test("strong continuous Don Quixote evidence can win", () => {
  const ranking = scorePersonas(unpricedProfile(12), {
    historyComplete: true,
    positionPerformance: donQuixoteSummary([{ returnPct: -0.90, days: 45 }]),
  });
  assert.equal(ranking.winner?.personaId, "don_quixote");
  assert.equal(ranking.resultReason, null);
});

test("wallets under the general history minimum return INSUFFICIENT_HISTORY", () => {
  const ranking = scorePersonas(unpricedProfile(9), { historyComplete: true });
  assert.equal(ranking.qualifyingSwaps, 9);
  assert.equal(ranking.requiredQualifyingSwaps, 10);
  assert.equal(ranking.winner, null);
  assert.equal(ranking.resultReason, "INSUFFICIENT_HISTORY");
});

test("weightedValue divides by the declared total weight, not the available weight", () => {
  const allAvailable = weightedValue([[dimension(80), 0.45], [dimension(60), 0.35], [dimension(81), 0.2]]);
  assert.equal(allAvailable, (80 * 0.45 + 60 * 0.35 + 81 * 0.2) / 1);

  const oneNull = weightedValue([[dimension(null), 0.45], [dimension(60), 0.35], [dimension(81), 0.2]]);
  assert.equal(oneNull, (60 * 0.35 + 81 * 0.2) / 1);

  const multipleNull = weightedValue([[dimension(null), 0.45], [dimension(null), 0.35], [dimension(81), 0.2]]);
  assert.equal(multipleNull, 81 * 0.2);

  const allNull = weightedValue([[dimension(null), 0.45], [dimension(null), 0.35], [dimension(null), 0.2]]);
  assert.equal(allNull, 0);

  // Phase 5F spec example: null @ 0.45, null @ 0.35, 81 @ 0.20 -> 16.2, not 81.
  assert.equal(multipleNull, 16.2);
  assert.ok(allAvailable > oneNull && oneNull > multipleNull && multipleNull > allNull);
});

test("activity alone cannot produce a strong Newton Match without re-entries", () => {
  // 40 single-buy positions across distinct tokens, all priced: high activity,
  // zero completed positions, zero re-entries.
  const transactions = Array.from({ length: 40 }, (_, index) => ({
    ...swap(`buy-${index}`, 1_000 + index, "IN", 50),
    tokenChanges: [
      { mint: `mint-${index}`, symbol: "TOKEN", amount: 10, direction: "IN" as const, usdValue: 50 },
      { mint: "SOL", symbol: "SOL", amount: 1, direction: "OUT" as const, usdValue: 50 },
    ],
  }));
  const ranking = scorePersonas(
    buildWalletBehaviorProfile(transactions, { historyComplete: true }),
    { historyComplete: true },
  );
  const newton = ranking.scores.find((persona) => persona.personaId === "newton");
  // ACTIVITY alone carries only its declared 0.10 weight in the Newton formula.
  assert.ok((newton?.match ?? 100) < 50, `newton match ${newton?.match} should be far below 50`);
  assert.ok((newton?.match ?? 100) <= 10 + 1e-9, "ACTIVITY weight is 0.10, so the match is capped near 10");
});

test("0, 1, and 9 qualifying swaps route to the Diogenes special persona", () => {
  for (const swapCount of [0, 1, 9]) {
    const ranking = scorePersonas(unpricedProfile(swapCount), { historyComplete: true });
    const outcome = resolvePersonaOutcome(ranking);
    assert.equal(outcome.kind, "SPECIAL_PERSONA");
    assert.equal(outcome.personaId, "diogenes");
    assert.equal(outcome.reason, "INSUFFICIENT_HISTORY");
    assert.equal(outcome.qualifyingSwaps, swapCount);
    assert.equal(outcome.requiredQualifyingSwaps, 10);
    assert.equal(REQUIRED_QUALIFYING_SWAPS, 10);
    assert.ok(!("match" in outcome), "special persona must not carry a Match percentage");
    assert.ok(!("confidence" in outcome), "special persona must not carry a confidence score");
    assert.equal(ranking.winner, null, "special wallets never receive a normal winner");
  }
});

test("10 qualifying swaps stay in the normal pipeline, never Diogenes", () => {
  const ranking = scorePersonas(unpricedProfile(10), { historyComplete: true });
  const outcome = resolvePersonaOutcome(ranking);
  assert.notEqual(outcome.kind, "SPECIAL_PERSONA");
  assert.equal(ranking.qualifyingSwaps, 10);
});

test("10+ swaps without a strong match are INCONCLUSIVE, not Diogenes", () => {
  const ranking = scorePersonas(unpricedProfile(12), { historyComplete: true });
  const outcome = resolvePersonaOutcome(ranking);
  assert.equal(outcome.kind, "PERSONA_INCONCLUSIVE");
  assert.equal(outcome.reason, "NO_ELIGIBLE_PERSONA");
});

test("Diogenes routing leaves normal scoring untouched", () => {
  const ranking = scorePersonas(unpricedProfile(5), { historyComplete: true });
  const outcome = resolvePersonaOutcome(ranking);
  assert.equal(outcome.kind, "SPECIAL_PERSONA");
  assert.equal(ranking.scores.length, 8, "all eight normal personas still scored for diagnostics");
  assert.equal(ranking.eligibleScores.length, 0, "special routing must not create eligibility");
});

test("a strong wallet resolves to a NORMAL_PERSONA outcome", () => {
  const ranking = scorePersonas(unpricedProfile(12), {
    historyComplete: true,
    positionPerformance: donQuixoteSummary([{ returnPct: -0.9, days: 45 }]),
  });
  const outcome = resolvePersonaOutcome(ranking);
  assert.equal(outcome.kind, "NORMAL_PERSONA");
  assert.equal(outcome.personaId, "don_quixote");
  assert.equal(outcome.match, ranking.winner?.match);
});
