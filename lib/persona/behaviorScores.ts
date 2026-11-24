import type { WalletBehaviorProfile } from "../analysis/behaviorTypes";
import { evidence, formatDuration, formatPercent, formatUsd } from "./personaEvidence";
import type { BehaviorScore, BehaviorScores } from "./personaTypes";

export const NORMALIZATION_CONFIG = {
  activityReferenceSwaps: 1_000,
  repetitionScaleTrades: 6,
  diversificationReferenceTokens: 100,
  reentryReferenceCount: 10,
  holdingReferenceSeconds: 30 * 86_400,
  meaningfulProgressRate: 0.10,
  profitabilityScaleRate: 0.05,
  tradeSizeMinUsd: 10,
  tradeSizeMaxUsd: 100_000,
  addReferenceCount: 20,
} as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const toScore = (value: number) => clamp01(value) * 100;

/** Maps zero to 0 and `reference` to 100 using log1p. */
export function logCountScore(value: number, reference: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return toScore(Math.log1p(value) / Math.log1p(reference));
}

/** Maps a positive value between configurable bounds onto a 0–100 log scale. */
export function logRangeScore(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value <= 0 || maximum <= minimum) return 0;
  const logged = (Math.log(value) - Math.log(minimum)) / (Math.log(maximum) - Math.log(minimum));
  return toScore(logged);
}

/** Smooth saturation for ratios/counts without a discontinuous threshold. */
export function saturationScore(value: number, scale: number) {
  if (!Number.isFinite(value) || value <= 0 || scale <= 0) return 0;
  return toScore(1 - Math.exp(-value / scale));
}

function score(
  value: number | null,
  confidence: number,
  sampleSize: number,
  scoreEvidence: BehaviorScore["evidence"],
): BehaviorScore {
  return {
    value: value === null ? null : Math.max(0, Math.min(100, value)),
    confidence: Math.max(0, Math.min(100, confidence)),
    sampleSize,
    evidence: scoreEvidence,
  };
}

function reliableReentries(profile: WalletBehaviorProfile) {
  return profile.ledgers.flatMap((ledger) => ledger.reentries)
    .filter((event) => event.exitPriceUsd !== undefined && event.reentryPriceUsd !== undefined);
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function buildBehaviorScores(profile: WalletBehaviorProfile): BehaviorScores {
  const { features, ledgers, reconstruction } = profile;
  const tradeLegCount = features.buyCount + features.sellCount;
  const repeatedTradeRate = tradeLegCount > 0
    ? Math.max(0, tradeLegCount - features.tradedTokenCount) / tradeLegCount
    : 0;
  const activityValue = logCountScore(
    features.qualifyingSwapCount,
    NORMALIZATION_CONFIG.activityReferenceSwaps,
  );
  const activityConfidence = toScore(1 - Math.exp(-features.qualifyingSwapCount / 25));

  const turnoverValue = features.turnoverScore.value === null
    ? null
    : features.turnoverScore.value * 100;
  const repetitionValue = tradeLegCount === 0
    ? null
    : saturationScore(
        Math.max(0, features.avgTradesPerToken - 1),
        NORMALIZATION_CONFIG.repetitionScaleTrades,
      );

  const concentrationValue = features.concentrationScore.value === null
    ? null
    : features.concentrationScore.value * 100;
  const diversificationValue = features.tradedTokenCount === 0
    ? null
    : logCountScore(
        features.tradedTokenCount,
        NORMALIZATION_CONFIG.diversificationReferenceTokens,
      );

  const reentryOpportunityCount = features.completedPositionCount;
  const reentryRate = reentryOpportunityCount > 0
    ? Math.min(1, features.reentryCount / reentryOpportunityCount)
    : 0;
  const reentryValue = reentryOpportunityCount === 0
    ? null
    : 0.5 * logCountScore(features.reentryCount, NORMALIZATION_CONFIG.reentryReferenceCount)
      + 0.5 * reentryRate * 100;

  const pricedReentries = reliableReentries(profile);
  const reentryPremiums = pricedReentries.map((event) =>
    (event.reentryPriceUsd as number) / (event.exitPriceUsd as number) - 1
  );
  const higherPriceCount = reentryPremiums.filter((premium) => premium > 0).length;
  const higherPriceRate = pricedReentries.length > 0 ? higherPriceCount / pricedReentries.length : 0;
  const medianPremium = reentryPremiums.length > 0 ? median(reentryPremiums) : null;
  const positivePremiumStrength = medianPremium === null
    ? 0
    : clamp01(Math.max(0, medianPremium) / 0.5);
  const fomoReentryValue = pricedReentries.length === 0
    ? null
    : 0.25 * logCountScore(pricedReentries.length, NORMALIZATION_CONFIG.reentryReferenceCount)
      + 0.5 * higherPriceRate * 100
      + 0.25 * positivePremiumStrength * 100;
  const reentryPriceCoverage = features.reentryCount > 0
    ? pricedReentries.length / features.reentryCount
    : 0;

  const holdingValue = features.medianHoldDurationSeconds.value === null
    ? null
    : logCountScore(
        features.medianHoldDurationSeconds.value,
        NORMALIZATION_CONFIG.holdingReferenceSeconds,
      );
  const progress = features.progressEfficiency.value;
  const financialCoverage = Math.min(
    features.progressEfficiency.coverage,
    features.realizedPnlUsd.coverage,
    features.totalVolumeUsd.coverage,
  );
  const profitabilityValue = progress === null
    ? null
    : 50 + 50 * Math.tanh(progress / NORMALIZATION_CONFIG.profitabilityScaleRate);
  const efficiencyValue = progress === null
    ? null
    : toScore(Math.abs(progress) / NORMALIZATION_CONFIG.meaningfulProgressRate);

  const pricedSwaps = reconstruction.qualifyingSwaps.flatMap((transaction) =>
    transaction.valuation?.usdValue === null || transaction.valuation?.usdValue === undefined
      ? []
      : [transaction.valuation.usdValue]
  );
  const medianTradeSize = pricedSwaps.length > 0 ? median(pricedSwaps) : null;
  const tradeSizeValue = medianTradeSize === null
    ? null
    : logRangeScore(
        medianTradeSize,
        NORMALIZATION_CONFIG.tradeSizeMinUsd,
        NORMALIZATION_CONFIG.tradeSizeMaxUsd,
      );
  const tradeSizeCoverage = features.qualifyingSwapCount > 0
    ? pricedSwaps.length / features.qualifyingSwapCount
    : 0;

  const addCount = ledgers.reduce(
    (sum, ledger) => sum + ledger.events.filter((event) => event.eventType === "ADD").length,
    0,
  );
  const tokensWithRepeatedAdds = ledgers.filter((ledger) =>
    ledger.events.filter((event) => event.eventType === "ADD").length >= 2
  ).length;
  const addRate = features.buyCount > 0 ? addCount / features.buyCount : 0;
  const riskExpansionValue = features.buyCount === 0
    ? null
    : 0.45 * logCountScore(addCount, NORMALIZATION_CONFIG.addReferenceCount)
      + 0.35 * addRate * 100
      + 0.20 * logCountScore(tokensWithRepeatedAdds, 10);

  return {
    ACTIVITY: score(activityValue, activityConfidence, features.qualifyingSwapCount, [
      evidence("QUALIFYING SWAPS", String(features.qualifyingSwapCount), activityValue / 100),
    ]),
    TURNOVER: score(turnoverValue, features.turnoverScore.coverage * 100, features.turnoverScore.sampleSize, [
      evidence("TRADES PER TOKEN", features.avgTradesPerToken.toFixed(2), (turnoverValue ?? 0) / 100),
    ]),
    REPETITION: score(repetitionValue, activityConfidence, tradeLegCount, [
      evidence("REPEATED TRADE RATE", formatPercent(repeatedTradeRate), repeatedTradeRate),
    ]),
    CONCENTRATION: score(
      concentrationValue,
      features.concentrationScore.coverage * 100,
      features.concentrationScore.sampleSize,
      [evidence(
        "VALUED ACQUISITION CONCENTRATION",
        concentrationValue === null ? "UNKNOWN" : formatPercent(concentrationValue / 100),
        (concentrationValue ?? 0) / 100,
      )],
    ),
    DIVERSIFICATION: score(diversificationValue, activityConfidence, features.tradedTokenCount, [
      evidence("TOKENS TRADED", String(features.tradedTokenCount), (diversificationValue ?? 0) / 100),
    ]),
    REENTRY: score(reentryValue, reentryOpportunityCount > 0 ? activityConfidence : 0, features.reentryCount, [
      evidence("REENTRIES / COMPLETED POSITIONS", `${features.reentryCount} / ${reentryOpportunityCount}`, reentryRate),
    ]),
    FOMO_REENTRY: score(fomoReentryValue, reentryPriceCoverage * 100, pricedReentries.length, [
      evidence("HIGHER-PRICE REENTRIES", `${higherPriceCount} / ${pricedReentries.length}`, higherPriceRate),
      evidence(
        "MEDIAN REENTRY PREMIUM",
        medianPremium === null ? "UNKNOWN" : formatPercent(medianPremium),
        positivePremiumStrength,
      ),
    ]),
    HOLDING: score(
      holdingValue,
      features.medianHoldDurationSeconds.coverage * 100,
      features.medianHoldDurationSeconds.sampleSize,
      [evidence(
        "MEDIAN HOLD",
        features.medianHoldDurationSeconds.value === null
          ? "UNKNOWN"
          : formatDuration(features.medianHoldDurationSeconds.value),
        (holdingValue ?? 0) / 100,
      )],
    ),
    PROFITABILITY: score(profitabilityValue, financialCoverage * 100, features.realizedPnlUsd.sampleSize, [
      evidence(
        "OBSERVED REALIZED PNL",
        features.realizedPnlUsd.value === null ? "UNKNOWN" : formatUsd(features.realizedPnlUsd.value),
        profitabilityValue === null ? 0 : Math.abs(profitabilityValue - 50) / 50,
      ),
    ]),
    EFFICIENCY: score(efficiencyValue, financialCoverage * 100, features.progressEfficiency.sampleSize, [
      evidence(
        "PROGRESS EFFICIENCY",
        progress === null ? "UNKNOWN" : formatPercent(progress, 2),
        efficiencyValue === null ? 0 : 1 - efficiencyValue / 100,
      ),
    ]),
    TRADE_SIZE: score(tradeSizeValue, tradeSizeCoverage * 100, pricedSwaps.length, [
      evidence(
        "MEDIAN TRADE SIZE",
        medianTradeSize === null ? "UNKNOWN" : formatUsd(medianTradeSize),
        (tradeSizeValue ?? 0) / 100,
      ),
    ]),
    RISK_EXPANSION: score(riskExpansionValue, activityConfidence, addCount, [
      evidence("ADD EVENTS", String(addCount), logCountScore(addCount, NORMALIZATION_CONFIG.addReferenceCount) / 100),
      evidence("TOKENS WITH REPEATED ADDS", String(tokensWithRepeatedAdds), logCountScore(tokensWithRepeatedAdds, 10) / 100),
    ]),
  };
}
