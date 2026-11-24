import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedTransaction, NormalizedTokenChange } from "./types";
import { buildWalletBehaviorProfile } from "./behaviorFeatures";

const SOL_MINT = "So11111111111111111111111111111111111111112";

function change(mint: string, amount: number, direction: "IN" | "OUT", usd?: number): NormalizedTokenChange {
  return { mint, symbol: mint === SOL_MINT ? "SOL" : "TOKEN", amount, direction, ...(usd === undefined ? {} : { usdValue: usd }) };
}

function swap(
  signature: string,
  timestamp: number,
  mint: string,
  direction: "IN" | "OUT",
  tokenAmount: number,
  usd: number,
): NormalizedTransaction {
  // Acquiring `tokenAmount` of the non-quote asset costs `usd` of SOL and vice
  // versa, so both legs are present and the swap qualifies.
  const tokenChange = change(mint, tokenAmount, direction, usd);
  const solChange = change(SOL_MINT, usd, direction === "IN" ? "OUT" : "IN", usd);
  return {
    signature,
    timestamp,
    type: "SWAP",
    tokenChanges: direction === "IN" ? [tokenChange, solChange] : [solChange, tokenChange],
    valuation: {
      signature,
      timestamp,
      usdValue: usd,
      inputPriceUsd: usd,
      outputPriceUsd: usd,
      source: "SOL_HISTORICAL_PRICE",
      confidence: "MEDIUM",
    },
  };
}

const buy = (signature: string, timestamp: number, amount: number, usd = 10) =>
  swap(signature, timestamp, "mint-a", "IN", amount, usd);
const sell = (signature: string, timestamp: number, amount: number, usd = 10) =>
  swap(signature, timestamp, "mint-a", "OUT", amount, usd);

function telemetry(transactions: NormalizedTransaction[], historyComplete = true) {
  const { features } = buildWalletBehaviorProfile(transactions, { historyComplete });
  return { actions: features.positionActions, episodes: features.episodeTerminalStates, interaction: features.assetInteraction };
}

test("BUY -> HOLD telemetry", () => {
  const { actions, episodes } = telemetry([buy("b1", 1_000, 10)]);
  assert.equal(actions.buyLegCount, 1);
  assert.equal(actions.addLegCount, 0);
  assert.equal(actions.partialSellLegCount, 0);
  assert.equal(actions.exitLegCount, 0);
  assert.equal(actions.reentryLegCount, 0);
  assert.equal(actions.disposalLegCount, 0);
  assert.equal(actions.cyclingLegCount, 0);
  assert.equal(episodes.observedOpenEpisodeCount, 1);
  assert.equal(episodes.observedExitEpisodeCount, 0);
  assert.equal(episodes.unresolvedDisappearanceEpisodeCount, 0);
  assert.equal(episodes.unknownOpeningStateEpisodeCount, 0);
});

test("BUY -> PARTIAL_SELL -> HOLD counts one cycling leg", () => {
  const { actions, episodes } = telemetry([buy("b1", 1_000, 10), sell("s1", 2_000, 4)]);
  assert.equal(actions.buyLegCount, 1);
  assert.equal(actions.partialSellLegCount, 1);
  assert.equal(actions.exitLegCount, 0);
  assert.equal(actions.disposalLegCount, 1);
  assert.equal(actions.cyclingLegCount, 1);
  assert.equal(episodes.observedOpenEpisodeCount, 1);
  assert.equal(episodes.observedExitEpisodeCount, 0);
});

test("BUY -> PARTIAL_SELL -> ADD -> PARTIAL_SELL counts both partial sells", () => {
  const { actions, episodes } = telemetry([
    buy("b1", 1_000, 10),
    sell("s1", 2_000, 4),
    buy("a1", 3_000, 6),
    sell("s2", 4_000, 8),
  ]);
  assert.equal(actions.buyLegCount, 1);
  assert.equal(actions.addLegCount, 1);
  assert.equal(actions.partialSellLegCount, 2);
  assert.equal(actions.exitLegCount, 0);
  assert.equal(actions.disposalLegCount, 2);
  assert.equal(actions.cyclingLegCount, 2);
  assert.equal(episodes.observedOpenEpisodeCount, 1);
});

test("BUY -> EXIT closes the episode", () => {
  const { actions, episodes } = telemetry([buy("b1", 1_000, 10), sell("s1", 2_000, 10)]);
  assert.equal(actions.exitLegCount, 1);
  assert.equal(actions.partialSellLegCount, 0);
  assert.equal(actions.disposalLegCount, 1);
  assert.equal(episodes.observedExitEpisodeCount, 1);
  assert.equal(episodes.observedOpenEpisodeCount, 0);
});

test("BUY -> EXIT -> REENTRY is a cycling leg and reopens an episode", () => {
  const { actions, episodes } = telemetry([
    buy("b1", 1_000, 10),
    sell("s1", 2_000, 10),
    buy("r1", 3_000, 5),
  ]);
  assert.equal(actions.exitLegCount, 1);
  assert.equal(actions.reentryLegCount, 1);
  assert.equal(actions.cyclingLegCount, 2);
  assert.equal(episodes.observedExitEpisodeCount, 1);
  assert.equal(episodes.observedOpenEpisodeCount, 1);
});

test("partial-history overdraw is an unresolved disappearance, never an EXIT", () => {
  const { actions, episodes } = telemetry([buy("b1", 1_000, 3), sell("s1", 2_000, 5)], false);
  assert.equal(actions.exitLegCount, 0);
  assert.equal(actions.partialSellLegCount, 1);
  assert.equal(episodes.observedOpenEpisodeCount, 0);
  assert.equal(episodes.observedExitEpisodeCount, 0);
  assert.equal(episodes.unresolvedDisappearanceEpisodeCount, 1);
  assert.equal(episodes.unknownOpeningStateEpisodeCount, 0);
});

test("first observed action is a disposal under partial history -> unknown opening state", () => {
  const { episodes } = telemetry([sell("s1", 1_000, 5)], false);
  assert.equal(episodes.unknownOpeningStateEpisodeCount, 1);
  assert.equal(episodes.observedOpenEpisodeCount, 0);
  assert.equal(episodes.unresolvedDisappearanceEpisodeCount, 0);
});

test("repeated interaction rates aggregate per asset", () => {
  const transactions = [
    buy("b1", 1_000, 10),
    swap("b2", 1_001, "mint-b", "IN", 10, 10),
    swap("b3", 1_002, "mint-c", "IN", 10, 10),
    swap("b4", 1_003, "mint-c", "IN", 10, 10),
    swap("b5", 1_004, "mint-c", "OUT", 10, 10),
  ];
  const { interaction } = telemetry(transactions);
  assert.equal(interaction.tradedAssetCount, 3);
  assert.equal(interaction.repeatedAssetRate, 1 / 3);
  assert.equal(interaction.highlyRepeatedAssetRate, 1 / 3);
  assert.equal(interaction.meanTradeLegsPerAsset, 5 / 3);
});
