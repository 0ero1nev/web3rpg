import assert from "node:assert/strict";
import test from "node:test";
import type { PositionPerformance, PositionPerformanceSummary } from "../analysis/positionPerformance";
import type { LedgerEventType, TokenLedger, TradeLeg } from "../analysis/behaviorTypes";
import {
  buildIcarusStoryData,
  extractIcarusStoryFacts,
  selectIcarusStoryEvent,
} from "./icarusStory";

const OPENED = Date.UTC(2026, 0, 1) / 1_000;
const PEAK = Date.UTC(2026, 0, 5) / 1_000;
const OUTCOME = Date.UTC(2026, 0, 10) / 1_000;

function leg(eventType: LedgerEventType, timestamp: number, amount: number, usdValue?: number): TradeLeg {
  const side = eventType === "BUY" || eventType === "RE_ENTRY" || eventType === "ADD" ? "BUY" : "SELL";
  return {
    signature: `${eventType}-${timestamp}`,
    timestamp,
    side,
    eventType,
    mint: "mint-a",
    symbol: "FLY",
    amount,
    ...(usdValue === undefined ? {} : { usdValue, unitPriceUsd: usdValue / amount }),
    counterAssets: [],
    realizedPnlUsd: null,
  };
}

function ledger(events: TradeLeg[], open = false): TokenLedger {
  return {
    mint: "mint-a",
    symbol: "FLY",
    firstTradeAt: OPENED,
    lastTradeAt: events.at(-1)?.timestamp ?? OPENED,
    buys: events.filter((event) => event.side === "BUY"),
    sells: events.filter((event) => event.side === "SELL"),
    totalBought: events.filter((event) => event.side === "BUY").reduce((sum, event) => sum + event.amount, 0),
    totalSold: events.filter((event) => event.side === "SELL").reduce((sum, event) => sum + event.amount, 0),
    currentTrackedAmount: open
      ? events.reduce((amount, event) => amount + (event.side === "BUY" ? event.amount : -event.amount), 0)
      : 0,
    buyCount: events.filter((event) => event.side === "BUY").length,
    sellCount: events.filter((event) => event.side === "SELL").length,
    holdingPeriods: [{ openedAt: OPENED, ...(open ? {} : { closedAt: OUTCOME, durationSeconds: OUTCOME - OPENED }), openingStateUnknown: false }],
    reentries: [],
    openingStateUnknown: false,
    trackingStateUnknown: false,
    averageCostUsd: null,
    realizedPnlUsd: { value: null, coverage: 0, sampleSize: 0 },
    events,
  };
}

function position(overrides: Partial<PositionPerformance> = {}): PositionPerformance {
  return {
    id: `mint-a:${OPENED}:0`,
    mint: "mint-a",
    symbol: "FLY",
    status: "CLOSED",
    openedAt: OPENED,
    closedAt: OUTCOME,
    entryValueUsd: 100,
    exitValueUsd: 150,
    currentValueUsd: null,
    currentAmount: null,
    unrealizedPnlUsd: null,
    peakValueUsd: 300,
    entryPriceUsd: 10,
    exitPriceUsd: 15,
    currentPriceUsd: null,
    peakPriceUsd: 30,
    peakTimestamp: PEAK,
    outcomeTimestamp: OUTCOME,
    peakReturnPct: 2,
    realizedReturnPct: 0.5,
    unrealizedReturnPct: null,
    givebackPct: 0.75,
    holdingDuration: OUTCOME - OPENED,
    priceCoverage: 1,
    peakConfidence: "HIGH",
    sampleCount: 10,
    requestedSampleCount: 10,
    priceConfidence: "HIGH",
    priceReason: null,
    ...overrides,
  };
}

function summary(item: PositionPerformance): PositionPerformanceSummary {
  return {
    positions: [item],
    openPositions: item.status === "OPEN" ? 1 : 0,
    closedPositions: item.status === "CLOSED" ? 1 : 0,
    costReport: {
      positionsAvailable: 1,
      positionsConsidered: 1,
      priceBucketsRequested: 10,
      cacheHits: 10,
      cacheHitRate: 1,
      externalRequests: 0,
      estimatedColdCacheRequests: 1,
      unpricedPositions: 0,
      requestLimitReached: false,
      providerAvailable: true,
      providerStatusReason: null,
      maxExternalRequests: 20,
      historicalPriceEligibleEpisodes: 1,
      historicalPricePricedEpisodes: 1,
      historicalPriceCoverage: 1,
      providerFailures: 0,
      unsupportedTokens: 0,
    },
  };
}

function closedLedger(events: TradeLeg[] = [leg("BUY", OPENED, 10, 100), leg("EXIT", OUTCOME, 10, 150)]) {
  return ledger(events);
}

function storyFor(item: PositionPerformance, sourceLedger = closedLedger(), historyComplete = true) {
  return buildIcarusStoryData({
    match: 82,
    historyComplete,
    positionPerformance: summary(item),
    ledgers: [sourceLedger],
  });
}

test("full reliable position Story uses position return, profit giveback, and realized outcome", () => {
  const story = storyFor(position());
  assert.equal(story.evidenceLevel, "FULL_POSITION_EVIDENCE");
  assert.equal(story.screens.length, 5);
  assert.equal(story.screens[1].fact, "200%");
  assert.match(story.screens[1].body.join(" "), /position was up/i);
  assert.equal(story.screens[3].fact, "75%");
  assert.match(story.screens[3].footer?.[0] ?? "", /REALIZED RESULT: \+\$50\.00 \(\+50%\)/);
});

test("partial history preserves verified dated transactions and numeric price movement", () => {
  const source = closedLedger([leg("BUY", OPENED, 10), leg("EXIT", OUTCOME, 10)]);
  const story = storyFor(position({ entryValueUsd: null, exitValueUsd: null }), source, false);
  assert.equal(story.historyComplete, false);
  assert.equal(story.evidenceLevel, "TOKEN_PRICE_EVIDENCE");
  assert.equal(story.screens[1].fact, "200%");
  assert.match(story.screens[1].body.join(" "), /FLY rose/i);
  assert.equal(story.screens[2].eyebrow, "JANUARY 1, 2026");
  assert.doesNotMatch(JSON.stringify(story.screens), /REALIZED RESULT/);
});

test("addition before peak contributes to peak position evidence and chronology", () => {
  const source = closedLedger([
    leg("BUY", OPENED, 10, 100),
    leg("ADD", PEAK - 100, 5, 100),
    leg("EXIT", OUTCOME, 15, 150),
  ]);
  const story = storyFor(position({ entryValueUsd: 200, exitValueUsd: 150, exitPriceUsd: 10 }), source);
  assert.equal(story.evidenceLevel, "FULL_POSITION_EVIDENCE");
  assert.match(story.screens[2].body.join(" "), /before the sampled peak/i);
  assert.equal(story.definingEvent?.peakPosition.available, true);
  assert.equal(story.definingEvent?.profitGiveback.available, true);
});

test("addition after peak is shown without fabricating profit giveback", () => {
  const source = closedLedger([
    leg("BUY", OPENED, 10, 100),
    leg("ADD", PEAK + 100, 5, 100),
    leg("EXIT", OUTCOME, 15, 150),
  ]);
  const story = storyFor(position({ entryValueUsd: 200, exitValueUsd: 150, exitPriceUsd: 10 }), source);
  assert.equal(story.evidenceLevel, "PARTIAL_POSITION_EVIDENCE");
  assert.match(story.screens[2].body.join(" "), /after the sampled peak/i);
  assert.equal(story.definingEvent?.profitGiveback.available, false);
  assert.match(story.screens[3].headline.join(" "), /TOKEN FELL/);
});

test("partial sale remains visible and keeps price movement separate from outcome", () => {
  const source = closedLedger([
    leg("BUY", OPENED, 10, 100),
    leg("PARTIAL_SELL", PEAK + 100, 2, 60),
    leg("EXIT", OUTCOME, 8, 80),
  ]);
  const story = storyFor(position({ exitValueUsd: 140, exitPriceUsd: 14, realizedReturnPct: 0.4 }), source);
  assert.match(story.screens[2].headline.join(" "), /TOOK SOME OFF/);
  assert.match(story.screens[2].body.join(" "), /after the sampled peak/i);
  assert.match(story.screens[3].footer?.[0] ?? "", /REALIZED RESULT: \+\$40\.00/);
});

test("missing peak timestamp shows token gain and a verified purchase without a peak date", () => {
  const story = storyFor(position({ peakTimestamp: null }));
  assert.equal(story.evidenceLevel, "PARTIAL_POSITION_EVIDENCE");
  assert.equal(story.screens[1].eyebrow, "SAMPLED PEAK DATE UNAVAILABLE");
  assert.equal(story.screens[1].fact, "200%");
  assert.match(story.screens[1].body.join(" "), /FLY rose/i);
  assert.equal(story.screens[2].eyebrow, "JANUARY 1, 2026");
  assert.equal(story.definingEvent?.peakPosition.available, false);
});

test("known realized loss is labeled and never presented as unrealized", () => {
  const story = storyFor(position({ exitValueUsd: 50, exitPriceUsd: 5, realizedReturnPct: -0.5 }));
  assert.match(story.screens[3].footer?.[0] ?? "", /REALIZED RESULT: -\$50\.00 \(-50%\)/);
  assert.doesNotMatch(JSON.stringify(story.screens[3]), /UNREALIZED RESULT/);
});

test("open position reports an unrealized outcome", () => {
  const source = ledger([leg("BUY", OPENED, 10, 100)], true);
  const openPosition = position({
    status: "OPEN",
    closedAt: null,
    exitValueUsd: null,
    exitPriceUsd: null,
    currentValueUsd: 120,
    currentAmount: 10,
    currentPriceUsd: 12,
    realizedReturnPct: null,
    unrealizedReturnPct: 0.2,
    givebackPct: 0.9,
  });
  const story = storyFor(openPosition, source);
  assert.equal(story.evidenceLevel, "FULL_POSITION_EVIDENCE");
  assert.match(story.screens[3].footer?.[0] ?? "", /UNREALIZED RESULT: \+\$20\.00 \(\+20%\)/);
});

test("missing cost basis falls back to token language and omits wallet PnL", () => {
  const source = closedLedger([leg("BUY", OPENED, 10), leg("EXIT", OUTCOME, 10)]);
  const story = storyFor(position({ entryValueUsd: null, exitValueUsd: null }), source);
  assert.equal(story.evidenceLevel, "TOKEN_PRICE_EVIDENCE");
  assert.match(story.screens[1].body.join(" "), /FLY rose/i);
  assert.doesNotMatch(JSON.stringify(story.screens), /YOUR POSITION WAS UP|RESULT:/);
});

test("unsafe aggregate entry still preserves the verified sampled price", () => {
  const source = closedLedger([
    leg("BUY", OPENED, 10),
    leg("ADD", PEAK + 100, 5),
    leg("EXIT", OUTCOME, 15),
  ]);
  const story = storyFor(position({ peakTimestamp: null, entryValueUsd: null, exitValueUsd: null }), source, false);
  assert.equal(story.evidenceLevel, "TOKEN_PRICE_EVIDENCE");
  assert.equal(story.screens[1].fact, "$30.00");
  assert.match(story.screens[1].footer?.join(" ") ?? "", /no gain is claimed/i);
  assert.doesNotMatch(JSON.stringify(story.screens[1]), /rose|position was up/i);
});

test("no reliable price samples produces no financial numbers", () => {
  const story = storyFor(position({
    peakPriceUsd: null,
    peakValueUsd: null,
    peakTimestamp: null,
    peakReturnPct: null,
    givebackPct: null,
    priceCoverage: 0,
    peakConfidence: "LOW",
  }));
  assert.equal(story.evidenceLevel, "NO_PRICE_EVIDENCE");
  assert.equal(story.definingEvent, undefined);
  const middle = JSON.stringify(story.screens.slice(1, 4));
  assert.doesNotMatch(middle, /\d+%|\$\d|JANUARY/);
});

test("selector remains deterministic and follows scoring strength", () => {
  const facts = extractIcarusStoryFacts({
    match: 82,
    historyComplete: true,
    positionPerformance: summary(position()),
    ledgers: [closedLedger()],
  });
  const stronger = { ...facts.candidates[0], id: "stronger", mint: "mint-b", selectionStrength: 9 };
  assert.equal(selectIcarusStoryEvent([facts.candidates[0], stronger])?.id, "stronger");
  assert.equal(selectIcarusStoryEvent([stronger, facts.candidates[0]])?.id, "stronger");
});
