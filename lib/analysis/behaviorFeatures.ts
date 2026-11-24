import type { NormalizedTransaction } from "./types";
import type {
  DerivedMetric,
  ReconstructionOptions,
  WalletBehaviorFeatures,
  WalletBehaviorProfile,
} from "./behaviorTypes";
import { reconstructPositions } from "./reconstructPositions";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function metric(value: number | null, coverage: number, sampleSize: number): DerivedMetric<number> {
  return { value, coverage: clamp01(coverage), sampleSize };
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function buildWalletBehaviorProfile(
  transactions: NormalizedTransaction[],
  options: ReconstructionOptions = {},
): WalletBehaviorProfile {
  const reconstruction = reconstructPositions(transactions, options);
  const { ledgers, qualifyingSwaps } = reconstruction;
  const buyCount = ledgers.reduce((sum, ledger) => sum + ledger.buyCount, 0);
  const sellCount = ledgers.reduce((sum, ledger) => sum + ledger.sellCount, 0);
  const completedPeriods = ledgers.flatMap((ledger) => ledger.holdingPeriods)
    .filter((period) => period.closedAt !== undefined && !period.openingStateUnknown);
  const completedDurations = completedPeriods
    .map((period) => period.durationSeconds)
    .filter((duration): duration is number => duration !== undefined);
  const openPositionCount = ledgers.filter((ledger) =>
    !ledger.trackingStateUnknown && ledger.holdingPeriods.some((period) => period.closedAt === undefined)
  ).length;
  const reentryCount = ledgers.reduce((sum, ledger) => sum + ledger.reentries.length, 0);
  const avgTradesPerToken = ledgers.length > 0 ? (buyCount + sellCount) / ledgers.length : 0;

  const pricedSwapVolumes: number[] = [];
  for (const transaction of qualifyingSwaps) {
    const outbound = transaction.tokenChanges.filter((change) => change.direction === "OUT");
    const inbound = transaction.tokenChanges.filter((change) => change.direction === "IN");
    const fullyPricedOutbound = outbound.length > 0 && outbound.every((change) => change.usdValue !== undefined);
    const fullyPricedInbound = inbound.length > 0 && inbound.every((change) => change.usdValue !== undefined);
    if (fullyPricedOutbound) {
      pricedSwapVolumes.push(outbound.reduce((sum, change) => sum + Math.abs(change.usdValue ?? 0), 0));
    } else if (fullyPricedInbound) {
      pricedSwapVolumes.push(inbound.reduce((sum, change) => sum + Math.abs(change.usdValue ?? 0), 0));
    }
  }
  const volumeCoverage = qualifyingSwaps.length > 0 ? pricedSwapVolumes.length / qualifyingSwaps.length : 0;
  const totalVolumeUsd = metric(
    pricedSwapVolumes.length > 0 ? pricedSwapVolumes.reduce((sum, value) => sum + value, 0) : null,
    volumeCoverage,
    pricedSwapVolumes.length,
  );

  const pricedPnlLegs = ledgers.flatMap((ledger) => ledger.sells)
    .filter((leg) => leg.realizedPnlUsd !== null);
  const realizedPnlUsd = metric(
    pricedPnlLegs.length > 0
      ? pricedPnlLegs.reduce((sum, leg) => sum + (leg.realizedPnlUsd ?? 0), 0)
      : null,
    sellCount > 0 ? pricedPnlLegs.length / sellCount : 0,
    pricedPnlLegs.length,
  );

  const holdCoverage = completedPeriods.length > 0 ? completedDurations.length / completedPeriods.length : 0;
  const avgHoldDurationSeconds = metric(
    completedDurations.length > 0
      ? completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length
      : null,
    holdCoverage,
    completedDurations.length,
  );
  const medianHoldDurationSeconds = metric(
    completedDurations.length > 0 ? median(completedDurations) : null,
    holdCoverage,
    completedDurations.length,
  );

  const allBuyLegs = ledgers.flatMap((ledger) => ledger.buys);
  const pricedBuyLegs = allBuyLegs.filter((leg) => leg.usdValue !== undefined);
  const acquisitionByMint = new Map<string, number>();
  for (const leg of pricedBuyLegs) {
    acquisitionByMint.set(leg.mint, (acquisitionByMint.get(leg.mint) ?? 0) + Math.abs(leg.usdValue ?? 0));
  }
  const totalAcquisitionUsd = [...acquisitionByMint.values()].reduce((sum, value) => sum + value, 0);
  const shares = totalAcquisitionUsd > 0
    ? [...acquisitionByMint.values()].map((value) => value / totalAcquisitionUsd)
    : [];
  const concentrationCoverage = allBuyLegs.length > 0 ? pricedBuyLegs.length / allBuyLegs.length : 0;
  const largestPositionShare = metric(
    shares.length > 0 ? Math.max(...shares) : null,
    concentrationCoverage,
    pricedBuyLegs.length,
  );
  const concentrationScore = metric(
    shares.length > 0 ? shares.reduce((sum, share) => sum + share * share, 0) : null,
    concentrationCoverage,
    pricedBuyLegs.length,
  );

  const turnoverScore = metric(
    ledgers.length > 0 ? 1 - Math.exp(-avgTradesPerToken / 10) : null,
    ledgers.length > 0 ? 1 : 0,
    ledgers.length,
  );
  const activityScore = metric(
    reconstruction.qualifyingSwapCount > 0 ? 1 - Math.exp(-reconstruction.qualifyingSwapCount / 100) : null,
    reconstruction.qualifyingSwapCount > 0 ? 1 : 0,
    reconstruction.qualifyingSwapCount,
  );
  const knownEpisodeCount = completedPeriods.length + openPositionCount;
  const profitTakingScore = metric(
    knownEpisodeCount > 0 ? completedPeriods.length / knownEpisodeCount : null,
    knownEpisodeCount > 0 ? 1 : 0,
    knownEpisodeCount,
  );

  // Position-action telemetry, sourced exclusively from the reconstruction
  // state machine's classified legs and episode terminal states.
  const legCounts = { buy: 0, add: 0, partialSell: 0, exit: 0, reEntry: 0 };
  for (const ledger of ledgers) {
    for (const event of ledger.events) {
      if (event.eventType === "BUY") legCounts.buy += 1;
      else if (event.eventType === "ADD") legCounts.add += 1;
      else if (event.eventType === "PARTIAL_SELL") legCounts.partialSell += 1;
      else if (event.eventType === "EXIT") legCounts.exit += 1;
      else if (event.eventType === "RE_ENTRY") legCounts.reEntry += 1;
    }
  }
  const positionActions = {
    buyLegCount: legCounts.buy,
    addLegCount: legCounts.add,
    partialSellLegCount: legCounts.partialSell,
    exitLegCount: legCounts.exit,
    reentryLegCount: legCounts.reEntry,
    disposalLegCount: legCounts.partialSell + legCounts.exit,
    cyclingLegCount: legCounts.partialSell + legCounts.exit + legCounts.reEntry,
  };
  const legsPerAsset = ledgers.map((ledger) => ledger.events.length);
  const assetInteraction = {
    tradedAssetCount: ledgers.length,
    meanTradeLegsPerAsset: legsPerAsset.length > 0
      ? legsPerAsset.reduce((sum, value) => sum + value, 0) / legsPerAsset.length
      : 0,
    medianTradeLegsPerAsset: legsPerAsset.length > 0 ? median(legsPerAsset) : 0,
    repeatedAssetRate: ledgers.length > 0
      ? ledgers.filter((ledger) => ledger.events.length > 1).length / ledgers.length
      : 0,
    highlyRepeatedAssetRate: ledgers.length > 0
      ? ledgers.filter((ledger) => ledger.events.length >= 3).length / ledgers.length
      : 0,
  };
  // Each ledger's non-closed remainder lands in exactly one terminal bucket:
  // unknown opening state first, then unresolved disappearance, then open.
  let unresolvedDisappearance = 0;
  let unknownOpeningState = 0;
  for (const ledger of ledgers) {
    const hasOpenPeriod = !ledger.trackingStateUnknown
      && ledger.holdingPeriods.some((period) => period.closedAt === undefined);
    if (hasOpenPeriod) continue;
    if (ledger.openingStateUnknown) unknownOpeningState += 1;
    else if (ledger.trackingStateUnknown && ledger.currentTrackedAmount <= 0) unresolvedDisappearance += 1;
    else if (ledger.currentTrackedAmount > 0) unknownOpeningState += 1;
  }
  const episodeTerminalStates = {
    observedOpenEpisodeCount: openPositionCount,
    observedExitEpisodeCount: completedPeriods.length,
    unresolvedDisappearanceEpisodeCount: unresolvedDisappearance,
    unknownOpeningStateEpisodeCount: unknownOpeningState,
  };

  const durationConviction = medianHoldDurationSeconds.value === null
    ? null
    : 1 - Math.exp(-medianHoldDurationSeconds.value / (30 * 86_400));
  const convictionValue = durationConviction === null || concentrationScore.value === null
    ? null
    : (durationConviction + concentrationScore.value) / 2;
  const convictionScore = metric(
    convictionValue,
    convictionValue === null ? 0 : Math.min(medianHoldDurationSeconds.coverage, concentrationScore.coverage),
    convictionValue === null ? 0 : Math.min(medianHoldDurationSeconds.sampleSize, concentrationScore.sampleSize),
  );

  const progressValue = realizedPnlUsd.value === null
    || totalVolumeUsd.value === null
    || totalVolumeUsd.value <= 0
    ? null
    : realizedPnlUsd.value / totalVolumeUsd.value;
  const progressEfficiency = metric(
    progressValue,
    progressValue === null ? 0 : Math.min(realizedPnlUsd.coverage, totalVolumeUsd.coverage),
    progressValue === null ? 0 : Math.min(realizedPnlUsd.sampleSize, totalVolumeUsd.sampleSize),
  );

  const features: WalletBehaviorFeatures = {
    qualifyingSwapCount: reconstruction.qualifyingSwapCount,
    tradedTokenCount: ledgers.length,
    buyCount,
    sellCount,
    completedPositionCount: completedPeriods.length,
    openPositionCount,
    reentryCount,
    avgTradesPerToken,
    totalVolumeUsd,
    realizedPnlUsd,
    avgHoldDurationSeconds,
    medianHoldDurationSeconds,
    largestPositionShare,
    concentrationScore,
    turnoverScore,
    activityScore,
    profitTakingScore,
    convictionScore,
    progressEfficiency,
    positionActions,
    assetInteraction,
    episodeTerminalStates,
  };

  return { features, ledgers, reconstruction };
}
