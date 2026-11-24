import assert from "node:assert/strict";
import test from "node:test";
import type { HistoricalPricingDiagnostics } from "./valuationTypes";
import { applyHistoricalPricingAvailability } from "./pricingAvailability";

const unavailable: HistoricalPricingDiagnostics = {
  status: "UNAVAILABLE",
  requestedTimestampCount: 100,
  resolvedTimestampCount: 0,
  requestedBucketCount: 10,
  resolvedBucketCount: 0,
  coinbaseRequestCount: 1,
  coinbaseFailureCount: 1,
  coingeckoRequestCount: 1,
  coingeckoFailureCount: 1,
};

test("material pricing outage cannot masquerade as ordinary inconclusive", () => {
  const result = applyHistoricalPricingAvailability(
    { kind: "INCONCLUSIVE", reason: "NO_STRONG_MATCH", qualifyingSwaps: 100 },
    100,
    0,
    unavailable,
  );
  assert.deepEqual(result, {
    kind: "INCONCLUSIVE",
    reason: "HISTORICAL_PRICING_UNAVAILABLE",
    qualifyingSwaps: 100,
  });
});

test("pricing outage does not override low-activity special-persona routing", () => {
  const result = applyHistoricalPricingAvailability(
    {
      kind: "SPECIAL_PERSONA",
      id: "diogenes",
      name: "DIOGENES",
      subtitle: "THE OBSERVER",
      artwork: "/personas/diogenes.png",
      metrics: [],
      quote: [],
      personaId: "diogenes",
      reason: "INSUFFICIENT_HISTORY",
      qualifyingSwaps: 2,
    },
    2,
    0,
    unavailable,
  );
  assert.equal(result.kind, "SPECIAL_PERSONA");
});
