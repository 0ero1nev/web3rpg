import type {
  PositionPerformance,
  PositionPerformanceSummary,
  PositionPriceConfidence,
  PositionPriceReason,
} from "./positionPerformance";

export type CurrentPriceReasonCounts = Record<PositionPriceReason, number>;

export type CurrentOpenPositionValidation = {
  openPositions: number;
  openPositionsWithReliableCostBasis: number;
  openPositionsWithCurrentPrice: number;
  profitableOpenPositions: number;
  losingOpenPositions: number;
  severelyLosingOpenPositions: number;
  currentPriceCoverage: number;
  unavailableReasons: CurrentPriceReasonCounts;
};

export type HistoricalPriceValidation = {
  historicalPriceEligibleEpisodes: number;
  historicalPricePricedEpisodes: number;
  historicalPriceCoverage: number;
  requestedBuckets: number;
  externalRequests: number;
  cacheHits: number;
  providerFailures: number;
  unsupportedTokens: number;
  providerAvailable: boolean;
  providerStatusReason: "NO_API_KEY" | null;
  requestLimitReached: boolean;
};

export type OpenPositionCandidate = {
  mint: string;
  symbol?: string;
  entryCostUsd: number | null;
  currentValueUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedReturnPct: number | null;
  holdingDuration: number | null;
  priceConfidence: PositionPriceConfidence;
  eligible: boolean;
  reason: string;
};

export type IcarusCandidate = {
  mint: string;
  symbol?: string;
  entryPriceUsd: number;
  observedPeakPriceUsd: number;
  finalPriceUsd: number;
  peakReturnPct: number | null;
  givebackPct: number | null;
  historicalPriceCoverage: number;
  sampleCount: number;
};

export type PriceCoverageValidation = {
  historical: HistoricalPriceValidation;
  current: CurrentOpenPositionValidation;
  midasCandidates: OpenPositionCandidate[];
  donQuixoteCandidates: OpenPositionCandidate[];
  icarusCandidates: IcarusCandidate[];
};

const REASONS: PositionPriceReason[] = [
  "NO_PROVIDER_PRICE",
  "UNSUPPORTED_TOKEN",
  "UNKNOWN_COST_BASIS",
  "PARTIAL_HISTORY",
  "DUST_POSITION",
  "OTHER",
];

function currentReasons(open: PositionPerformance[]) {
  const counts = Object.fromEntries(REASONS.map((reason) => [reason, 0])) as CurrentPriceReasonCounts;
  for (const position of open) {
    if (position.priceReason) counts[position.priceReason] += 1;
  }
  return counts;
}

function baseCandidate(position: PositionPerformance): Omit<OpenPositionCandidate, "eligible" | "reason"> {
  return {
    mint: position.mint,
    ...(position.symbol ? { symbol: position.symbol } : {}),
    entryCostUsd: position.entryValueUsd,
    currentValueUsd: position.currentValueUsd,
    unrealizedPnlUsd: position.unrealizedPnlUsd,
    unrealizedReturnPct: position.unrealizedReturnPct,
    holdingDuration: position.holdingDuration,
    priceConfidence: position.priceConfidence,
  };
}

function missingPriceReason(position: PositionPerformance) {
  return position.priceReason ?? "OTHER";
}

function midasCandidate(position: PositionPerformance): OpenPositionCandidate {
  const reasons: string[] = [];
  if (position.entryValueUsd === null || position.entryPriceUsd === null) reasons.push("UNKNOWN_COST_BASIS");
  if (position.currentPriceUsd === null || position.currentValueUsd === null) {
    reasons.push(missingPriceReason(position));
  }
  if (position.currentValueUsd !== null && position.currentValueUsd < 100) reasons.push("CURRENT_VALUE_BELOW_$100");
  if (position.unrealizedReturnPct !== null && position.unrealizedReturnPct <= 0) reasons.push("NOT_PROFITABLE");
  if (position.holdingDuration !== null && position.holdingDuration < 7 * 86_400) reasons.push("HELD_LESS_THAN_7_DAYS");
  const eligible = position.unrealizedReturnPct !== null
    && position.unrealizedReturnPct > 0
    && position.currentValueUsd !== null
    && position.currentValueUsd >= 100
    && position.holdingDuration !== null
    && position.holdingDuration >= 7 * 86_400;
  return { ...baseCandidate(position), eligible, reason: eligible ? "ELIGIBLE" : [...new Set(reasons)].join(" | ") || "OTHER" };
}

function donQuixoteCandidate(position: PositionPerformance): OpenPositionCandidate {
  const reasons: string[] = [];
  if (position.entryValueUsd === null || position.entryPriceUsd === null) reasons.push("UNKNOWN_COST_BASIS");
  if (position.currentPriceUsd === null || position.currentValueUsd === null) {
    reasons.push(missingPriceReason(position));
  }
  if (position.unrealizedReturnPct !== null && position.unrealizedReturnPct > -0.5) reasons.push("LOSS_NOT_SEVERE_ENOUGH");
  if (position.holdingDuration !== null && position.holdingDuration < 30 * 86_400) reasons.push("HELD_LESS_THAN_30_DAYS");
  const eligible = position.unrealizedReturnPct !== null
    && position.unrealizedReturnPct <= -0.5
    && position.holdingDuration !== null
    && position.holdingDuration >= 30 * 86_400;
  return { ...baseCandidate(position), eligible, reason: eligible ? "ELIGIBLE" : [...new Set(reasons)].join(" | ") || "OTHER" };
}

function potentialMidas(left: PositionPerformance, right: PositionPerformance) {
  if (left.unrealizedReturnPct !== null && right.unrealizedReturnPct !== null) {
    return right.unrealizedReturnPct - left.unrealizedReturnPct
      || (right.holdingDuration ?? 0) - (left.holdingDuration ?? 0);
  }
  if (left.unrealizedReturnPct !== null) return -1;
  if (right.unrealizedReturnPct !== null) return 1;
  return (right.currentValueUsd ?? 0) - (left.currentValueUsd ?? 0)
    || (right.holdingDuration ?? 0) - (left.holdingDuration ?? 0);
}

function potentialDonQuixote(left: PositionPerformance, right: PositionPerformance) {
  if (left.unrealizedReturnPct !== null && right.unrealizedReturnPct !== null) {
    return left.unrealizedReturnPct - right.unrealizedReturnPct
      || (right.holdingDuration ?? 0) - (left.holdingDuration ?? 0);
  }
  if (left.unrealizedReturnPct !== null) return -1;
  if (right.unrealizedReturnPct !== null) return 1;
  return (right.holdingDuration ?? 0) - (left.holdingDuration ?? 0)
    || (right.currentValueUsd ?? 0) - (left.currentValueUsd ?? 0);
}

export function buildPriceCoverageValidation(
  summary: PositionPerformanceSummary,
): PriceCoverageValidation {
  const open = summary.positions.filter((position) => position.status === "OPEN");
  const reliableCost = open.filter((position) =>
    position.entryValueUsd !== null && position.entryPriceUsd !== null
  );
  const currentPriced = open.filter((position) => position.currentPriceUsd !== null);
  const returns = open.filter((position) => position.unrealizedReturnPct !== null);
  const { costReport } = summary;
  const pricedHistorical = summary.positions.filter((position) =>
    position.peakPriceUsd !== null
    && position.entryPriceUsd !== null
    && (position.exitPriceUsd !== null || position.currentPriceUsd !== null)
  );

  return {
    historical: {
      historicalPriceEligibleEpisodes: costReport.historicalPriceEligibleEpisodes,
      historicalPricePricedEpisodes: costReport.historicalPricePricedEpisodes,
      historicalPriceCoverage: costReport.historicalPriceCoverage,
      requestedBuckets: costReport.priceBucketsRequested,
      externalRequests: costReport.externalRequests,
      cacheHits: costReport.cacheHits,
      providerFailures: costReport.providerFailures,
      unsupportedTokens: costReport.unsupportedTokens,
      providerAvailable: costReport.providerAvailable,
      providerStatusReason: costReport.providerStatusReason,
      requestLimitReached: costReport.requestLimitReached,
    },
    current: {
      openPositions: open.length,
      openPositionsWithReliableCostBasis: reliableCost.length,
      openPositionsWithCurrentPrice: currentPriced.length,
      profitableOpenPositions: returns.filter((position) => (position.unrealizedReturnPct ?? 0) > 0).length,
      losingOpenPositions: returns.filter((position) => (position.unrealizedReturnPct ?? 0) < 0).length,
      severelyLosingOpenPositions: returns.filter((position) => (position.unrealizedReturnPct ?? 0) <= -0.5).length,
      currentPriceCoverage: open.length > 0 ? currentPriced.length / open.length : 0,
      unavailableReasons: currentReasons(open),
    },
    midasCandidates: open.slice().sort(potentialMidas).slice(0, 3).map(midasCandidate),
    donQuixoteCandidates: open.slice().sort(potentialDonQuixote).slice(0, 3).map(donQuixoteCandidate),
    icarusCandidates: pricedHistorical.slice().sort((left, right) =>
      ((right.peakReturnPct ?? 0) * (right.givebackPct ?? 0))
      - ((left.peakReturnPct ?? 0) * (left.givebackPct ?? 0))
    ).slice(0, 3).map((position) => ({
      mint: position.mint,
      ...(position.symbol ? { symbol: position.symbol } : {}),
      entryPriceUsd: position.entryPriceUsd as number,
      observedPeakPriceUsd: position.peakPriceUsd as number,
      finalPriceUsd: (position.exitPriceUsd ?? position.currentPriceUsd) as number,
      peakReturnPct: position.peakReturnPct,
      givebackPct: position.givebackPct,
      historicalPriceCoverage: position.priceCoverage,
      sampleCount: position.sampleCount,
    })),
  };
}
