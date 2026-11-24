import assert from "node:assert/strict";
import test from "node:test";
import type { PositionPerformance, PositionPerformanceSummary } from "../analysis/positionPerformance";
import { buildWalletBehaviorProfile } from "../analysis/behaviorFeatures";
import { buildDonQuixoteStoryData, selectDonQuixotePosition } from "./donQuixoteStory";

function position(overrides: Partial<PositionPerformance> = {}): PositionPerformance {
  return {
    id: "loss", mint: "asset", status: "OPEN", openedAt: 1000, closedAt: null,
    entryValueUsd: 100, exitValueUsd: null, currentValueUsd: 12.7, currentAmount: 10,
    unrealizedPnlUsd: -87.3, peakValueUsd: null, entryPriceUsd: 10, exitPriceUsd: null,
    currentPriceUsd: 1.27, peakPriceUsd: null, peakReturnPct: null, realizedReturnPct: null,
    unrealizedReturnPct: -0.873, givebackPct: null, holdingDuration: 47.8 * 86400,
    priceCoverage: 0, peakConfidence: "LOW", sampleCount: 0, requestedSampleCount: 0,
    priceConfidence: "HIGH", priceReason: null, ...overrides,
  };
}
function story(positions: PositionPerformance[]) {
  return buildDonQuixoteStoryData({ match: 77, positionPerformance: { positions } as PositionPerformanceSummary });
}

test("four chapters derive loss and completed holding days from the same worst open position", () => {
  const result = story([position({ id: "milder", unrealizedReturnPct: -0.55, holdingDuration: 200 * 86400 }), position()]);
  assert.deepEqual(result.screens.map((screen) => screen.id), ["believer", "fall", "wait", "verdict"]);
  assert.equal(result.screens[1].fact, "−87.3%");
  assert.equal(result.screens[2].fact, "47 DAYS.");
  assert.equal(result.screens[1].eventId, result.screens[2].eventId);
  assert.equal(result.definingPositionId, "loss");
});

test("closed, winning, dust, unpriced, and nonfinite positions cannot supply story numbers", () => {
  const invalid = [position({ status: "CLOSED" }), position({ unrealizedReturnPct: 0.2 }),
    position({ currentAmount: 0 }), position({ priceConfidence: "LOW" }),
    position({ unrealizedReturnPct: NaN }), position({ unrealizedReturnPct: -Infinity }),
    position({ unrealizedReturnPct: null }), position({ unrealizedReturnPct: -1.1 })];
  const result = story(invalid);
  assert.equal(result.definingPositionId, undefined);
  assert.ok(result.screens.every((screen) => screen.fact === undefined));
});

test("loss ties use holding duration and stable id without mutating analysis", () => {
  const positions = [position({ id: "z" }), position({ id: "a" }), position({ id: "short", holdingDuration: 86400 })];
  assert.equal(selectDonQuixotePosition(positions)?.id, "a");
  assert.equal(selectDonQuixotePosition([...positions].reverse())?.id, "a");
  assert.deepEqual(positions.map((item) => item.id), ["z", "a", "short"]);
});

test("unknown durations are omitted and sub-day holdings are never rounded up", () => {
  for (const holdingDuration of [null, NaN, -1]) assert.equal(story([position({ holdingDuration })]).screens[2].fact, undefined);
  assert.equal(story([position({ holdingDuration: 86000 })]).screens[2].fact, "LESS THAN 1 DAY.");
  assert.equal(story([position({ holdingDuration: 86400 })]).screens[2].fact, "1 DAY.");
});

test("missing analysis never inserts the supplied design example", () => {
  const result = buildDonQuixoteStoryData({ match: 70 });
  assert.ok(result.screens.every((screen) => screen.fact === undefined));
  assert.ok(!JSON.stringify(result).includes("80.1"));
});

test("partial sales and unknown chronology do not claim the wallet never sold", () => {
  assert.equal(story([position()]).screens[1].body[1], "You didn't close the position.");
  const profile = buildWalletBehaviorProfile([
    { signature: "buy", timestamp: 1000, type: "SWAP", tokenChanges: [
      { mint: "SOL", amount: 1, direction: "OUT", usdValue: 100 },
      { mint: "asset", amount: 10, direction: "IN", usdValue: 100 },
    ] },
  ], { historyComplete: true });
  const input = { match: 77, positionPerformance: { positions: [position()] } as PositionPerformanceSummary, ledgers: profile.ledgers };
  assert.equal(buildDonQuixoteStoryData(input).screens[1].body[1], "You didn't sell.");
  const ledger = profile.ledgers.find((item) => item.mint === "asset")!;
  ledger.events.push({ ...ledger.events[0], timestamp: 2000, side: "SELL", eventType: "PARTIAL_SELL" });
  assert.equal(buildDonQuixoteStoryData(input).screens[1].body[1], "You didn't close the position.");
});
