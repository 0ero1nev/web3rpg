import assert from "node:assert/strict";
import test from "node:test";
import type { WalletProfile } from "./types";
import {
  resolveWalletProfileWithCache,
  shouldCacheWalletProfile,
} from "./buildWalletProfile";
import { getInconclusivePresentation } from "../persona/inconclusivePresentation";

function profile(
  result: WalletProfile["personaResult"],
  pricingStatus: WalletProfile["dataQuality"]["historicalPricingStatus"],
  valuedSwapCount: number,
): WalletProfile {
  return {
    address: "pricing-outage-regression",
    transactionCount: 500,
    analyzedTransactionCount: 500,
    holdings: [],
    transactions: [],
    personaResult: result,
    valuationSummary: {
      qualifyingSwapCount: 444,
      valuedSwapCount,
      swapValuationCoverage: valuedSwapCount / 444,
      sourceCounts: {
        STABLECOIN_EXECUTION: valuedSwapCount,
        SOL_HISTORICAL_PRICE: 0,
        PROPAGATED_EXECUTION_PRICE: 0,
        EXTERNAL_TOKEN_PRICE: 0,
        UNKNOWN: 444 - valuedSwapCount,
      },
      historicalPricing: {
        status: pricingStatus,
        requestedTimestampCount: 447,
        resolvedTimestampCount: valuedSwapCount,
        requestedBucketCount: 80,
        resolvedBucketCount: valuedSwapCount > 0 ? 80 : 0,
        coinbaseRequestCount: 2,
        coinbaseFailureCount: valuedSwapCount > 0 ? 0 : 2,
        coingeckoRequestCount: valuedSwapCount > 0 ? 0 : 6,
        coingeckoFailureCount: valuedSwapCount > 0 ? 0 : 6,
      },
    },
    dataQuality: {
      historyComplete: false,
      pricingCoverage: 0.5,
      confidence: "LOW",
      historicalPricingStatus: pricingStatus,
      degradedReasons: pricingStatus === "UNAVAILABLE" ? ["HISTORICAL_PRICING_UNAVAILABLE"] : [],
    },
  };
}

test("pricing outage is presented as interrupted and never cached; recovery recomputes", async () => {
  const outage = profile({
    kind: "INCONCLUSIVE",
    reason: "HISTORICAL_PRICING_UNAVAILABLE",
    qualifyingSwaps: 444,
  }, "UNAVAILABLE", 0);
  const recovered = profile({
    kind: "NORMAL_PERSONA",
    id: "newton",
    name: "NEWTON",
    subtitle: "THE RETURNER",
    artwork: "/personas/newton.png",
    match: 72,
    rarity: "RARE",
    metrics: [],
    quote: [],
    personaId: "newton",
    confidence: 90,
    evidence: [],
    story: [],
  }, "OK", 400);
  const address = `pricing-outage-${Date.now()}-${Math.random()}`;
  let builds = 0;
  const build = async () => (++builds === 1 ? outage : recovered);

  const first = await resolveWalletProfileWithCache(address, build);
  assert.equal(first.dataQuality.historicalPricingStatus, "UNAVAILABLE");
  assert.equal(first.valuationSummary?.valuedSwapCount, 0);
  assert.equal(first.personaResult?.kind, "INCONCLUSIVE");
  assert.equal(shouldCacheWalletProfile(first), false);

  const presentation = getInconclusivePresentation("HISTORICAL_PRICING_UNAVAILABLE");
  assert.equal(presentation.eyebrow, "ANALYSIS INTERRUPTED");
  assert.equal(presentation.cta, "TRY AGAIN");
  assert.doesNotMatch(`${presentation.title} ${presentation.body} ${presentation.result ?? ""}`, /NO MATCH/i);

  const second = await resolveWalletProfileWithCache(address, build);
  assert.equal(builds, 2, "retry must recompute instead of returning the outage profile");
  assert.equal(second.dataQuality.historicalPricingStatus, "OK");
  assert.equal(second.valuationSummary?.valuedSwapCount, 400);
  assert.equal(second.personaResult?.kind, "NORMAL_PERSONA");

  const third = await resolveWalletProfileWithCache(address, build);
  assert.equal(builds, 2, "recovered successful analysis should use the normal cache");
  assert.equal(third.personaResult?.kind, "NORMAL_PERSONA");
});

test("profiles with partial provider failures never enter the normal result cache", () => {
  const partial = profile({
    kind: "INCONCLUSIVE",
    reason: "NO_STRONG_MATCH",
    qualifyingSwaps: 444,
  }, "PARTIAL", 250);
  assert.equal(shouldCacheWalletProfile(partial), false);
});

test("same-wallet in-flight requests share one cold build", async () => {
  const recovered = profile({
    kind: "NORMAL_PERSONA",
    id: "newton",
    name: "NEWTON",
    subtitle: "THE RETURNER",
    artwork: "/personas/newton.png",
    match: 72,
    rarity: "RARE",
    metrics: [],
    quote: [],
    personaId: "newton",
    confidence: 90,
    evidence: [],
    story: [],
  }, "OK", 400);
  const address = `dedup-${Date.now()}-${Math.random()}`;
  let builds = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const build = async () => {
    builds += 1;
    await gate;
    return recovered;
  };
  const first = resolveWalletProfileWithCache(address, build);
  const second = resolveWalletProfileWithCache(address, build);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(builds, 1);
  assert.equal(left, right);
});
