import assert from "node:assert/strict";
import test from "node:test";
import type { ReentryEvent, TokenLedger } from "../analysis/behaviorTypes";
import {
  buildNewtonStoryData,
  buildNewtonStoryModel,
  extractNewtonStoryFacts,
  formatNewtonElapsed,
  formatNewtonStoryDate,
  selectNewtonStoryEvent,
  type NewtonPostExitObservation,
} from "./newtonStory";

const EXIT = Date.UTC(2026, 2, 14, 4, 18, 0) / 1_000;

function ledger(
  mint: string,
  reentries: ReentryEvent[],
  symbol?: string,
): TokenLedger {
  return {
    mint,
    ...(symbol ? { symbol } : {}),
    firstTradeAt: EXIT - 3_600,
    lastTradeAt: reentries.at(-1)?.reentryAt ?? EXIT,
    buys: [],
    sells: [],
    totalBought: 1,
    totalSold: 1,
    currentTrackedAmount: 1,
    buyCount: 1,
    sellCount: 1,
    holdingPeriods: [],
    reentries,
    openingStateUnknown: false,
    trackingStateUnknown: false,
    averageCostUsd: null,
    realizedPnlUsd: { value: null, coverage: 0, sampleSize: 0 },
    events: [],
  };
}

function reentry(overrides: Partial<ReentryEvent> = {}): ReentryEvent {
  return {
    mint: "mint-a",
    exitAt: EXIT,
    reentryAt: EXIT + 11 * 3_600,
    exitPriceUsd: 10,
    reentryPriceUsd: 12.2,
    timeBetweenSeconds: 11 * 3_600,
    reenteredHigher: true,
    ...overrides,
  };
}

function observation(overrides: Partial<NewtonPostExitObservation> = {}): NewtonPostExitObservation {
  return {
    mint: "mint-a",
    exitTimestamp: EXIT,
    reentryTimestamp: EXIT + 11 * 3_600,
    peakTimestamp: EXIT + 6 * 3_600,
    peakPriceUsd: 13.4,
    ...overrides,
  };
}

test("Screens 1 and 2 always use the same selected event", () => {
  const story = buildNewtonStoryData({
    match: 73,
    historyComplete: false,
    ledgers: [ledger("mint-a", [reentry()], "BONK")],
    postExitObservations: [observation()],
  });
  assert.ok(story.definingEvent);
  assert.equal(story.screens[0].eventId, story.definingEvent.id);
  assert.equal(story.screens[1].eventId, story.definingEvent.id);
  assert.equal(story.screens[0].eventId, story.screens[1].eventId);
});

test("real timestamps and elapsed durations receive deterministic story formatting", () => {
  assert.equal(formatNewtonStoryDate(EXIT), "MARCH 14, 2026");
  assert.equal(formatNewtonElapsed(17 * 60_000), "17 MINUTES");
  assert.equal(formatNewtonElapsed(3 * 3_600_000), "3 HOURS");
  assert.equal(formatNewtonElapsed(11 * 3_600_000), "11 HOURS");
  assert.equal(formatNewtonElapsed(2 * 86_400_000), "2 DAYS");
});

test("re-entry premium is derived from the two observed execution prices", () => {
  const facts = extractNewtonStoryFacts({
    match: 73,
    historyComplete: true,
    ledgers: [ledger("mint-a", [reentry()])],
  });
  assert.ok(Math.abs((facts.candidates[0].reentryPremium ?? 0) - 0.22) < 1e-12);
  const story = buildNewtonStoryModel(facts);
  assert.match(story.screens[1].fact ?? "", /22% HIGHER/);
});

test("missing post-exit price never produces a fabricated post-exit percentage", () => {
  const story = buildNewtonStoryData({
    match: 73,
    historyComplete: false,
    ledgers: [ledger("mint-a", [reentry()], "BONK")],
  });
  assert.equal(story.evidenceLevel, "NO_POST_EXIT_PRICE");
  assert.equal(story.screens[0].fact, undefined);
  assert.doesNotMatch(JSON.stringify(story.screens[0]), /AFTER YOU LEFT|\+\d+%/);
});

test("missing token metadata uses neutral wording and never invents a symbol", () => {
  const story = buildNewtonStoryData({
    match: 73,
    historyComplete: false,
    ledgers: [ledger("not a valid mint", [reentry({ mint: "not a valid mint" })])],
  });
  assert.equal(story.definingEvent?.verifiedSymbol, undefined);
  assert.equal(story.definingEvent?.asset, "THIS TOKEN");
  assert.match(story.screens[1].body.join(" "), /THIS TOKEN/);
});

test("partial-history story uses bounded-window language and no lifetime superlatives", () => {
  const story = buildNewtonStoryData({
    match: 73,
    historyComplete: false,
    ledgers: [ledger("mint-a", [reentry({ exitPriceUsd: undefined, reentryPriceUsd: undefined, reenteredHigher: undefined })])],
  });
  const copy = JSON.stringify(story.screens).toUpperCase();
  assert.match(copy, /HISTORY WE ANALYZED|ANALYSIS WINDOW/);
  for (const unsafe of ["FIRST TRADE", "WORST TRADE EVER", "ONLY TIME", "ENTIRE TRADING HISTORY"]) {
    assert.doesNotMatch(copy, new RegExp(unsafe));
  }
});

test("the selector is deterministic and does not merely choose the newest event", () => {
  const facts = extractNewtonStoryFacts({
    match: 73,
    historyComplete: false,
    ledgers: [ledger("mint-a", [
      reentry({ exitAt: EXIT - 100_000, reentryAt: EXIT - 90_000, exitPriceUsd: 10, reentryPriceUsd: 15 }),
      reentry({ exitAt: EXIT, reentryAt: EXIT + 3_600, exitPriceUsd: 10, reentryPriceUsd: 11 }),
    ])],
  });
  const first = selectNewtonStoryEvent(facts.candidates);
  const second = selectNewtonStoryEvent(facts.candidates.slice().reverse());
  assert.deepEqual(first, second);
  assert.equal(first?.exitTimestamp, EXIT - 100_000, "larger premium should beat recency");
});

test("post-exit evidence from another asset cannot upgrade the selected event", () => {
  const story = buildNewtonStoryData({
    match: 73,
    historyComplete: false,
    ledgers: [ledger("mint-a", [reentry()])],
    postExitObservations: [observation({ mint: "mint-b" })],
  });
  assert.equal(story.evidenceLevel, "NO_POST_EXIT_PRICE");
  assert.equal(story.definingEvent?.postExitPeakReturn, undefined);
});

test("aggregate fallback replaces event chapters when no reliable event exists", () => {
  const story = buildNewtonStoryModel({
    match: 68,
    historyComplete: false,
    candidates: [],
    reentryCount: 3,
  });
  assert.equal(story.evidenceLevel, "AGGREGATE_ONLY");
  assert.equal(story.definingEvent, undefined);
  assert.equal(story.screens.length, 4);
  assert.match(JSON.stringify(story.screens.slice(0, 2)), /3 RETURNS OBSERVED/);
});

test("higher-price count remains unavailable when even one re-entry lacks comparison data", () => {
  const story = buildNewtonStoryData({
    match: 73,
    historyComplete: false,
    ledgers: [ledger("mint-a", [
      reentry(),
      reentry({ exitAt: EXIT + 50_000, reentryAt: EXIT + 60_000, exitPriceUsd: undefined, reentryPriceUsd: undefined, reenteredHigher: undefined }),
    ])],
  });
  assert.equal(story.reentryCount, 2);
  assert.equal(story.higherPriceReentryCount, undefined);
  assert.doesNotMatch(JSON.stringify(story.screens[2]), /0 of them/);
});
