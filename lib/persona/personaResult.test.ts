import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedTransaction } from "../analysis/types";
import type { PositionPerformanceSummary } from "../analysis/positionPerformance";
import { buildWalletBehaviorProfile } from "../analysis/behaviorFeatures";
import { getRarity } from "../personaRarity";
import { resolvePersonaOutcome, scorePersonas } from "./personaScoring";
import type { PersonaId } from "./personaTypes";
import { buildPersonaMetrics, buildPersonaResult } from "./personaResult";

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

function unpricedProfile(swapCount: number) {
  const transactions = Array.from({ length: swapCount }, (_, index) =>
    swap(`unknown-${index}`, 1_000 + index, index % 2 === 0 ? "IN" : "OUT", undefined));
  return buildWalletBehaviorProfile(transactions, { historyComplete: true });
}

function donQuixoteSummary(positions: Array<{ returnPct: number; days: number }>): PositionPerformanceSummary {
  return {
    positions: positions.map((position, index) => ({
      id: `pos-${index}`, mint: `mint-${index}`, status: "OPEN" as const, openedAt: 1_000, closedAt: null,
      entryValueUsd: 100, exitValueUsd: null, currentValueUsd: 100 * (1 + position.returnPct), currentAmount: 10,
      unrealizedPnlUsd: null, peakValueUsd: null, entryPriceUsd: 10, exitPriceUsd: null,
      currentPriceUsd: 10 * (1 + position.returnPct), peakPriceUsd: null, peakReturnPct: null,
      realizedReturnPct: null, unrealizedReturnPct: position.returnPct, givebackPct: null,
      holdingDuration: position.days * 86_400, priceCoverage: 1, peakConfidence: "LOW" as const,
      sampleCount: 0, requestedSampleCount: 0, priceConfidence: "HIGH" as const, priceReason: null,
    })),
    openPositions: positions.length,
    closedPositions: 0,
    costReport: {
      positionsAvailable: positions.length, positionsConsidered: 0, priceBucketsRequested: 0, cacheHits: 0,
      cacheHitRate: 0, externalRequests: 0, estimatedColdCacheRequests: 0, unpricedPositions: 0,
      requestLimitReached: false, providerAvailable: false, providerStatusReason: "NO_API_KEY",
      maxExternalRequests: 20, historicalPriceEligibleEpisodes: 0, historicalPricePricedEpisodes: 0,
      historicalPriceCoverage: 0, providerFailures: 0, unsupportedTokens: 0,
    },
  };
}

function resultFor(profile: ReturnType<typeof buildWalletBehaviorProfile>, extras: Partial<Parameters<typeof buildPersonaResult>[0]> = {}) {
  const ranking = scorePersonas(profile, {
    historyComplete: true,
    ...(extras.positionPerformance ? { positionPerformance: extras.positionPerformance } : {}),
  });
  const outcome = resolvePersonaOutcome(ranking);
  return buildPersonaResult({
    outcome,
    ranking,
    features: profile.features,
    ...extras,
  });
}

test("normal wallet routes to the winning persona with real metrics and rarity", () => {
  const profile = unpricedProfile(12);
  const positionPerformance = donQuixoteSummary([{ returnPct: -0.9, days: 45 }]);
  const result = resultFor(profile, { positionPerformance });
  assert.equal(result.kind, "NORMAL_PERSONA");
  if (result.kind !== "NORMAL_PERSONA") return;
  assert.equal(result.personaId, "don_quixote");
  assert.equal(result.name, "DON QUIXOTE");
  assert.ok(result.match !== undefined && result.match >= 50);
  assert.equal(result.rarity, getRarity(result.match ?? 0));
  const labels = result.metrics.map((metric) => metric.label);
  assert.deepEqual(labels, ["TOKEN DOWN", "HOLDING DAYS", "AVG ENTRY", "CONVICTION"]);
  const tokenDown = result.metrics[0];
  assert.equal(tokenDown.displayValue, "-90.0%");
  assert.equal(result.metrics[1].displayValue, "45d");
  assert.equal(result.metrics[2].displayValue, "$10.0");
  assert.equal(result.donQuixoteStory?.screens[1].fact, "−90.0%");
  assert.equal(result.donQuixoteStory?.screens[2].fact, "45 DAYS.");
  assert.equal(result.donQuixoteStory?.definingPositionId, "pos-0");
  // Story (historical) and evidence (wallet observations) stay separate arrays.
  assert.ok(result.story.length > 0);
  assert.ok(result.evidence.length > 0);
  assert.ok(result.evidence.every((item) => typeof item.value === "string" && item.value.length > 0));
});

test("0-9 qualifying swaps route to Diogenes with no match and no rarity", () => {
  for (const swapCount of [0, 5, 9]) {
    const result = resultFor(unpricedProfile(swapCount));
    assert.equal(result.kind, "SPECIAL_PERSONA");
    if (result.kind !== "SPECIAL_PERSONA") continue;
    assert.equal(result.personaId, "diogenes");
    assert.equal(result.qualifyingSwaps, swapCount);
    assert.ok(!("match" in result && result.match !== undefined), "Diogenes must not carry a match percentage");
    assert.ok(!("rarity" in result && result.rarity !== undefined), "Diogenes has no normal rarity");
    assert.equal(result.special, true);
    assert.equal(result.metrics[0].label, "QUALIFYING TRADES");
    assert.equal(result.metrics[0].displayValue, String(swapCount));
    assert.equal(result.metrics[1].displayValue, "MAX");
  }
});

test("10+ swaps without an eligible match produce an INCONCLUSIVE result with no card", () => {
  const result = resultFor(unpricedProfile(12));
  assert.equal(result.kind, "INCONCLUSIVE");
  if (result.kind !== "INCONCLUSIVE") return;
  assert.equal(result.reason, "NO_ELIGIBLE_PERSONA");
  assert.equal(result.qualifyingSwaps, 12);
  assert.ok(!("name" in result) && !("artwork" in result) && !("match" in result), "inconclusive must not render a persona card");
  assert.ok(!("topMatches" in result) && !("eligible" in result), "internal ranking gates must not leak to the UI model");
});

test("match maps to rarity at every product boundary", () => {
  assert.equal(getRarity(50), "COMMON");
  assert.equal(getRarity(64), "COMMON");
  assert.equal(getRarity(65), "RARE");
  assert.equal(getRarity(74), "RARE");
  assert.equal(getRarity(75), "EPIC");
  assert.equal(getRarity(89), "EPIC");
  assert.equal(getRarity(90), "LEGENDARY");
});

test("unmeasurable metrics display UNKNOWN instead of fabricated numbers", () => {
  const profile = unpricedProfile(12);
  // Croesus metrics with no wallet value, no top holding, no priced trades.
  const croesusMetrics = buildPersonaMetrics("croesus", {
    outcome: { kind: "NORMAL_PERSONA", personaId: "croesus" as PersonaId, match: 60, confidence: 50, ranking: scorePersonas(profile, { historyComplete: true }) },
    ranking: scorePersonas(profile, { historyComplete: true }),
    features: profile.features,
  });
  assert.equal(croesusMetrics[0].label, "WALLET SIZE");
  assert.equal(croesusMetrics[0].displayValue, "UNKNOWN");
  assert.equal(croesusMetrics[2].label, "TOP HOLDING");
  assert.equal(croesusMetrics[2].displayValue, "UNKNOWN");
  for (const metric of croesusMetrics) {
    assert.ok(metric.displayValue.length > 0, "every metric slot renders something");
  }
});

test("every persona metric set keeps its fixed four-label identity", () => {
  const identity: Record<string, string[]> = {
    newton: ["EXIT TIMING", "FOMO RESISTANCE", "RE-ENTRY CONTROL", "RECOVERY"],
    icarus: ["PEAK RETURN", "REALIZED RETURN", "EXIT DISCIPLINE", "ALTITUDE LOST"],
    midas: ["UNREALIZED PNL", "REALIZED PNL", "HOLDING POWER", "PROFIT TAKING"],
    sisyphus: ["TOTAL TRADES", "TOTAL VOLUME", "NET PNL", "PROGRESS"],
    don_quixote: ["TOKEN DOWN", "HOLDING DAYS", "AVG ENTRY", "CONVICTION"],
    caesar: ["LARGEST POSITION", "POSITION GROWTH", "CONVICTION", "DIVERSIFICATION"],
    napoleon: ["WIN STREAK", "RISK EXPOSURE", "LARGEST LOSS", "OVERCONFIDENCE"],
    croesus: ["WALLET SIZE", "AVG TRADE SIZE", "TOP HOLDING", "WHALE SCORE"],
  };
  const profile = unpricedProfile(12);
  const ranking = scorePersonas(profile, { historyComplete: true });
  for (const [personaId, labels] of Object.entries(identity)) {
    const metrics = buildPersonaMetrics(personaId, { outcome: { kind: "NORMAL_PERSONA", personaId: personaId as PersonaId, match: 60, confidence: 50, ranking }, ranking, features: profile.features });
    assert.deepEqual(metrics.map((metric) => metric.label), labels, personaId);
  }
});

test("all eight scoring ids resolve to complete normal Persona card data", () => {
  const personaIds = ["newton", "icarus", "midas", "sisyphus", "don_quixote", "caesar", "napoleon", "croesus"] as const;
  const profile = unpricedProfile(12);
  const ranking = scorePersonas(profile, { historyComplete: true });
  for (const personaId of personaIds) {
    const result = buildPersonaResult({
      outcome: { kind: "NORMAL_PERSONA", personaId, match: 60, confidence: 50, ranking },
      ranking,
      features: profile.features,
    });
    assert.equal(result.kind, "NORMAL_PERSONA", personaId);
    if (result.kind !== "NORMAL_PERSONA") continue;
    assert.equal(result.personaId, personaId);
    assert.equal(result.metrics.length, 4);
    assert.ok(result.name && result.subtitle && result.artwork && result.quote.length > 0);
  }
});
