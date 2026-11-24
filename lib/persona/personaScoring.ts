import type { WalletBehaviorProfile } from "../analysis/behaviorTypes";
import type { PositionPerformanceSummary } from "../analysis/positionPerformance";
import type { TradeSequenceAnalysis } from "../analysis/tradeSequences";
import { buildBehaviorScores, logRangeScore } from "./behaviorScores";
import { evidence, formatPercent, formatUsd } from "./personaEvidence";
import type {
  BehaviorScore,
  PersonaEvidence,
  PersonaId,
  PersonaOutcome,
  PersonaRanking,
  PersonaScore,
} from "./personaTypes";

export type PersonaScoringOptions = {
  historyComplete?: boolean;
  positionPerformance?: PositionPerformanceSummary;
  tradeSequences?: TradeSequenceAnalysis;
};

const GENERAL_MINIMUM_SWAPS = 10;

/** Normal-persona history minimum; below it the wallet routes to a special persona. */
export const REQUIRED_QUALIFYING_SWAPS = GENERAL_MINIMUM_SWAPS;

// Divides by the TOTAL DECLARED weight, not the available weight: a null
// dimension contributes zero to the numerator but keeps its weight in the
// denominator, so missing core evidence can never donate its weight to the
// remaining proxy dimensions. With every dimension available this is
// identical to the classic weighted average.
export function weightedValue(inputs: Array<[BehaviorScore, number]>) {
  const totalWeight = inputs.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  if (totalWeight === 0) return 0;
  const numerator = inputs.reduce(
    (sum, [dimension, itemWeight]) => sum + (dimension.value ?? 0) * itemWeight,
    0,
  );
  return numerator / totalWeight;
}

function weightedConfidence(inputs: Array<[BehaviorScore, number]>, historyComplete: boolean) {
  const weight = inputs.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  const observed = weight === 0 ? 0 : inputs.reduce(
    (sum, [dimension, itemWeight]) => sum + dimension.confidence * itemWeight,
    0,
  ) / weight;
  return observed * (historyComplete ? 1 : 0.9);
}

function rounded(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function result(
  personaId: PersonaId,
  match: number | null,
  confidence: number,
  eligible: boolean,
  personaEvidence: PersonaEvidence[],
  missingEvidence: string[],
): PersonaScore {
  const normalizedMatch = match === null ? null : rounded(match);
  return {
    personaId,
    match: normalizedMatch,
    score: normalizedMatch,
    confidence: rounded(confidence),
    eligible,
    evidence: personaEvidence,
    missingEvidence,
  };
}

function pricedSwapValues(profile: WalletBehaviorProfile) {
  return profile.reconstruction.qualifyingSwaps.flatMap((transaction) =>
    transaction.valuation?.usdValue === null || transaction.valuation?.usdValue === undefined
      ? []
      : [transaction.valuation.usdValue]
  );
}

function scoreSisyphus(profile: WalletBehaviorProfile, historyComplete: boolean): PersonaScore {
  const { features } = profile;
  const dimensions = buildBehaviorScores(profile);
  const stagnation: BehaviorScore = {
    ...dimensions.EFFICIENCY,
    value: dimensions.EFFICIENCY.value === null ? null : 100 - dimensions.EFFICIENCY.value,
  };
  const inputs: Array<[BehaviorScore, number]> = [
    [dimensions.ACTIVITY, 0.30],
    [dimensions.TURNOVER, 0.20],
    [dimensions.REPETITION, 0.20],
    [stagnation, 0.30],
  ];
  const missing: string[] = [];
  if (features.qualifyingSwapCount < 25) missing.push("At least 25 qualifying swaps");
  if (dimensions.EFFICIENCY.value === null) missing.push("USD-valued economic progress");
  if (features.realizedPnlUsd.coverage < 0.5) missing.push("At least 50% PnL coverage");
  const eligible = features.qualifyingSwapCount >= Math.max(25, GENERAL_MINIMUM_SWAPS)
    && dimensions.EFFICIENCY.value !== null
    && features.realizedPnlUsd.coverage >= 0.5;
  return result(
    "sisyphus",
    weightedValue(inputs),
    weightedConfidence(inputs, historyComplete),
    eligible,
    [
      ...dimensions.ACTIVITY.evidence,
      ...dimensions.REPETITION.evidence,
      ...dimensions.EFFICIENCY.evidence,
      evidence("PNL COVERAGE", formatPercent(features.realizedPnlUsd.coverage), features.realizedPnlUsd.coverage),
    ],
    missing,
  );
}

function scoreNewton(profile: WalletBehaviorProfile, historyComplete: boolean): PersonaScore {
  const { features, ledgers } = profile;
  const dimensions = buildBehaviorScores(profile);
  const pricedReentries = ledgers.flatMap((ledger) => ledger.reentries)
    .filter((event) => event.exitPriceUsd !== undefined && event.reentryPriceUsd !== undefined);
  const inputs: Array<[BehaviorScore, number]> = [
    [dimensions.REENTRY, 0.35],
    [dimensions.FOMO_REENTRY, 0.55],
    [dimensions.ACTIVITY, 0.10],
  ];
  const missing: string[] = [];
  if (features.qualifyingSwapCount < GENERAL_MINIMUM_SWAPS) missing.push("At least 10 qualifying swaps");
  if (features.completedPositionCount === 0) missing.push("Completed positions");
  if (features.reentryCount < 2) missing.push("At least 2 re-entry opportunities");
  if (pricedReentries.length < 2) missing.push("At least 2 priced exit/re-entry pairs");
  const eligible = features.qualifyingSwapCount >= GENERAL_MINIMUM_SWAPS
    && features.completedPositionCount > 0
    && features.reentryCount >= 2
    && pricedReentries.length >= 2;
  return result(
    "newton",
    weightedValue(inputs),
    weightedConfidence(inputs, historyComplete),
    eligible,
    [...dimensions.REENTRY.evidence, ...dimensions.FOMO_REENTRY.evidence],
    missing,
  );
}

function scoreCaesar(profile: WalletBehaviorProfile, historyComplete: boolean): PersonaScore {
  const { features, ledgers } = profile;
  const dimensions = buildBehaviorScores(profile);
  const lowDiversification: BehaviorScore = {
    ...dimensions.DIVERSIFICATION,
    value: dimensions.DIVERSIFICATION.value === null ? null : 100 - dimensions.DIVERSIFICATION.value,
  };
  const addCount = ledgers.reduce(
    (sum, ledger) => sum + ledger.events.filter((event) => event.eventType === "ADD").length,
    0,
  );
  const repeatedAddTokens = ledgers.filter((ledger) =>
    ledger.events.filter((event) => event.eventType === "ADD").length >= 2
  ).length;
  const inputs: Array<[BehaviorScore, number]> = [
    [dimensions.CONCENTRATION, 0.35],
    [lowDiversification, 0.15],
    [dimensions.RISK_EXPANSION, 0.35],
    [dimensions.REPETITION, 0.15],
  ];
  const missing: string[] = [];
  if (features.qualifyingSwapCount < GENERAL_MINIMUM_SWAPS) missing.push("At least 10 qualifying swaps");
  if (features.concentrationScore.coverage < 0.5) missing.push("At least 50% priced acquisition coverage");
  if (addCount < 3) missing.push("At least 3 ADD events");
  if (repeatedAddTokens === 0) missing.push("Repeated additions to the same asset");
  const eligible = features.qualifyingSwapCount >= GENERAL_MINIMUM_SWAPS
    && features.concentrationScore.coverage >= 0.5
    && dimensions.CONCENTRATION.value !== null
    && addCount >= 3
    && repeatedAddTokens > 0;
  return result(
    "caesar",
    weightedValue(inputs),
    weightedConfidence(inputs, historyComplete),
    eligible,
    [
      ...dimensions.CONCENTRATION.evidence,
      evidence(
        "LARGEST VALUED POSITION SHARE",
        features.largestPositionShare.value === null
          ? "UNKNOWN"
          : formatPercent(features.largestPositionShare.value),
        features.largestPositionShare.value ?? 0,
      ),
      ...dimensions.RISK_EXPANSION.evidence,
      ...dimensions.DIVERSIFICATION.evidence,
    ],
    missing,
  );
}

function scoreCroesus(profile: WalletBehaviorProfile, historyComplete: boolean): PersonaScore {
  const { features } = profile;
  const dimensions = buildBehaviorScores(profile);
  const trades = pricedSwapValues(profile);
  const largestTrade = trades.length > 0 ? Math.max(...trades) : null;
  const totalVolume = features.totalVolumeUsd.value;
  const volumeValue = totalVolume === null
    ? null
    : logRangeScore(totalVolume, 1_000, 10_000_000);
  const largestValue = largestTrade === null
    ? null
    : logRangeScore(largestTrade, 100, 1_000_000);
  const volumeDimension: BehaviorScore = {
    value: volumeValue,
    confidence: features.totalVolumeUsd.coverage * 100,
    sampleSize: features.totalVolumeUsd.sampleSize,
    evidence: [],
  };
  const largestDimension: BehaviorScore = {
    value: largestValue,
    confidence: dimensions.TRADE_SIZE.confidence,
    sampleSize: trades.length,
    evidence: [],
  };
  const inputs: Array<[BehaviorScore, number]> = [
    [volumeDimension, 0.55],
    [dimensions.TRADE_SIZE, 0.30],
    [largestDimension, 0.15],
  ];
  const missing: string[] = [];
  if (features.qualifyingSwapCount < GENERAL_MINIMUM_SWAPS) missing.push("At least 10 qualifying swaps");
  if (trades.length < 10) missing.push("At least 10 USD-valued swaps");
  if (features.totalVolumeUsd.coverage < 0.5) missing.push("At least 50% volume coverage");
  const eligible = features.qualifyingSwapCount >= GENERAL_MINIMUM_SWAPS
    && trades.length >= 10
    && totalVolume !== null
    && features.totalVolumeUsd.coverage >= 0.5;
  return result(
    "croesus",
    weightedValue(inputs),
    weightedConfidence(inputs, historyComplete),
    eligible,
    [
      evidence("OBSERVED USD VOLUME", totalVolume === null ? "UNKNOWN" : formatUsd(totalVolume), (volumeValue ?? 0) / 100),
      ...dimensions.TRADE_SIZE.evidence,
      evidence("LARGEST TRADE", largestTrade === null ? "UNKNOWN" : formatUsd(largestTrade), (largestValue ?? 0) / 100),
      evidence("VOLUME COVERAGE", formatPercent(features.totalVolumeUsd.coverage), features.totalVolumeUsd.coverage),
    ],
    missing,
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function averageTop(values: number[], count = 3) {
  const selected = values.slice().sort((a, b) => b - a).slice(0, count);
  return selected.length > 0
    ? selected.reduce((sum, value) => sum + value, 0) / selected.length
    : 0;
}

function scoreIcarus(performance?: PositionPerformanceSummary): PersonaScore {
  const measured = performance?.positions.filter((position) =>
    position.entryPriceUsd !== null
    && position.peakPriceUsd !== null
    && (position.exitPriceUsd !== null || position.currentPriceUsd !== null)
  ) ?? [];
  const candidates = measured.filter((position) =>
    (position.peakReturnPct ?? 0) >= 1
    && (position.givebackPct ?? 0) >= 0.5
    && position.priceCoverage >= 0.75
    && position.peakConfidence !== "LOW"
  );
  const episodeScores = measured.map((position) => {
    const rise = clamp01(Math.log1p(Math.max(0, position.peakReturnPct ?? 0)) / Math.log(11));
    const giveback = clamp01(position.givebackPct ?? 0);
    return (rise * 0.55 + giveback * 0.45) * 100;
  });
  const strongest = candidates.slice().sort((left, right) =>
    ((right.peakReturnPct ?? 0) * (right.givebackPct ?? 0))
      - ((left.peakReturnPct ?? 0) * (left.givebackPct ?? 0))
  )[0] ?? measured[0];
  const missing: string[] = [];
  if (!performance || performance.positions.length === 0) missing.push("Reliable position episodes");
  if (measured.length === 0) missing.push("Sufficient peak price coverage");
  if (candidates.length === 0) missing.push("A strong rise-before-fall episode");
  return result(
    "icarus",
    measured.length > 0 ? averageTop(episodeScores) : null,
    strongest ? strongest.priceCoverage * (strongest.peakConfidence === "HIGH" ? 100 : 80) : 0,
    candidates.length > 0,
    strongest ? [
      evidence("PEAK RETURN", formatPercent(strongest.peakReturnPct ?? 0), clamp01((strongest.peakReturnPct ?? 0) / 4)),
      evidence("GAIN GIVEBACK", formatPercent(strongest.givebackPct ?? 0), clamp01(strongest.givebackPct ?? 0)),
      evidence("PEAK PRICE COVERAGE", formatPercent(strongest.priceCoverage), strongest.priceCoverage),
    ] : [],
    missing,
  );
}

function scoreMidas(performance?: PositionPerformanceSummary): PersonaScore {
  const all = performance?.positions ?? [];
  const open = all.filter((position) => position.status === "OPEN");
  const measured = open.filter((position) =>
    position.entryPriceUsd !== null
    && position.currentPriceUsd !== null
    && position.unrealizedReturnPct !== null
  );
  const profitable = open.filter((position) =>
    position.unrealizedReturnPct !== null
    && position.unrealizedReturnPct > 0
    && position.currentValueUsd !== null
    && position.currentValueUsd >= 100
    && position.holdingDuration !== null
    && position.holdingDuration >= 7 * 86_400
  );
  const realizationRatio = all.length > 0
    ? all.filter((position) => position.status === "CLOSED").length / all.length
    : null;
  const scores = profitable.map((position) => {
    const profit = clamp01(Math.log1p(position.unrealizedReturnPct ?? 0) / Math.log(5));
    const duration = clamp01(Math.log1p((position.holdingDuration ?? 0) / 86_400) / Math.log(366));
    const unrealizedTendency = realizationRatio === null ? 0 : 1 - realizationRatio;
    return (profit * 0.45 + duration * 0.30 + unrealizedTendency * 0.25) * 100;
  });
  const strongest = profitable.slice().sort((left, right) =>
    (right.unrealizedReturnPct ?? 0) - (left.unrealizedReturnPct ?? 0)
  )[0];
  const missing: string[] = [];
  if (open.length === 0) missing.push("Open reconstructed positions");
  if (open.every((position) => position.currentPriceUsd === null || position.entryPriceUsd === null)) {
    missing.push("Open-position entry and current prices");
  }
  if (profitable.length === 0) missing.push("A meaningful profitable position held at least 7 days");
  return result(
    "midas",
    open.length > 0 && measured.length === 0 ? null : averageTop(scores),
    strongest ? Math.min(100, 65 + Math.min(profitable.length, 5) * 7) : 0,
    profitable.length > 0,
    strongest ? [
      evidence("UNREALIZED RETURN", formatPercent(strongest.unrealizedReturnPct ?? 0), clamp01((strongest.unrealizedReturnPct ?? 0) / 2)),
      evidence("OPEN POSITION VALUE", formatUsd(strongest.currentValueUsd ?? 0), clamp01((strongest.currentValueUsd ?? 0) / 10_000)),
      evidence("PROFITABLE HOLD DURATION", `${((strongest.holdingDuration ?? 0) / 86_400).toFixed(1)} days`, clamp01((strongest.holdingDuration ?? 0) / (180 * 86_400))),
      evidence("REALIZATION RATIO", realizationRatio === null ? "UNKNOWN" : formatPercent(realizationRatio), realizationRatio === null ? 0 : 1 - realizationRatio),
    ] : [],
    missing,
  );
}

// Continuous Don Quixote evidence: the position is clearly losing, but the
// wallet keeps holding it. Loss severity and holding persistence are scored
// continuously; the geometric mean requires BOTH to be meaningful.
function lossSeverity(returnPct: number) {
  return returnPct < 0 ? clamp01(Math.abs(returnPct) / 0.95) : 0;
}

// Persistence anchors: ~1 day weak, ~7 days moderate, ~30 days strong,
// ~90+ days very strong. Piecewise linear between anchors.
function holdingPersistence(durationSeconds: number) {
  const days = durationSeconds / 86_400;
  const anchors: Array<[number, number]> = [[0, 0], [1, 0.1], [7, 0.4], [30, 0.7], [90, 1]];
  if (days <= 0) return 0;
  for (let index = 1; index < anchors.length; index += 1) {
    const [anchorDay, anchorScore] = anchors[index];
    if (days <= anchorDay) {
      const [previousDay, previousScore] = anchors[index - 1];
      return previousScore + ((days - previousDay) / (anchorDay - previousDay)) * (anchorScore - previousScore);
    }
  }
  return 1;
}

function donQuixoteMatch(returnPct: number, durationSeconds: number | null) {
  const severity = lossSeverity(returnPct);
  const persistence = durationSeconds === null ? 0 : holdingPersistence(durationSeconds);
  return 100 * Math.sqrt(severity * persistence);
}

function scoreDonQuixote(performance?: PositionPerformanceSummary): PersonaScore {
  const open = performance?.positions.filter((position) => position.status === "OPEN") ?? [];
  const measured = open.filter((position) =>
    position.entryPriceUsd !== null
    && position.currentPriceUsd !== null
    && position.unrealizedReturnPct !== null
  );
  const losing = measured.filter((position) => (position.unrealizedReturnPct ?? 0) < 0);
  const scores = losing.map((position) =>
    donQuixoteMatch(position.unrealizedReturnPct ?? 0, position.holdingDuration));
  const strongest = losing.slice().sort((left, right) =>
    donQuixoteMatch(right.unrealizedReturnPct ?? 0, right.holdingDuration)
      - donQuixoteMatch(left.unrealizedReturnPct ?? 0, left.holdingDuration))[0];
  const missing: string[] = [];
  if (open.length === 0) missing.push("Open reconstructed positions");
  if (measured.length === 0) missing.push("Open-position entry and current prices");
  if (losing.length === 0 && measured.length > 0) missing.push("A measurable losing open position");
  return result(
    "don_quixote",
    open.length > 0 && measured.length === 0 ? null : averageTop(scores),
    strongest ? Math.min(100, 60 + Math.min(losing.length, 5) * 8) : 0,
    losing.length > 0,
    strongest ? [
      evidence("UNREALIZED RETURN", formatPercent(strongest.unrealizedReturnPct ?? 0), lossSeverity(strongest.unrealizedReturnPct ?? 0)),
      evidence("LOSING HOLD DURATION", `${((strongest.holdingDuration ?? 0) / 86_400).toFixed(1)} days`, strongest.holdingDuration === null ? 0 : holdingPersistence(strongest.holdingDuration)),
      evidence("POSITION STATUS", "OPEN", 1),
    ] : [],
    missing,
  );
}

function scoreNapoleon(sequences?: TradeSequenceAnalysis): PersonaScore {
  const strongestEvent = sequences?.events.slice().sort((left, right) => {
    const leftStrength = left.winningStreakLength
      * left.positionSizeExpansionRatio
      * Math.abs(left.subsequentLossReturnPct);
    const rightStrength = right.winningStreakLength
      * right.positionSizeExpansionRatio
      * Math.abs(right.subsequentLossReturnPct);
    return rightStrength - leftStrength;
  })[0];
  const streak = strongestEvent?.winningStreakLength ?? sequences?.winningStreakLength ?? 0;
  const expansion = strongestEvent?.positionSizeExpansionRatio
    ?? sequences?.positionSizeExpansionRatio
    ?? null;
  const loss = strongestEvent?.subsequentLossReturnPct
    ?? sequences?.largestSubsequentLoss
    ?? null;
  // A high match requires all three facts in the same observed episode chain.
  const sequenceMatch = strongestEvent
    ? (
      clamp01(strongestEvent.winningStreakLength / 5) * 0.25
      + clamp01((strongestEvent.positionSizeExpansionRatio - 1) / 3) * 0.35
      + clamp01(Math.abs(strongestEvent.subsequentLossReturnPct) / 0.8) * 0.40
    ) * 100
    : (sequences?.pricedCompletedEpisodes ?? 0) >= 3 ? 0 : null;
  const missing: string[] = [];
  if (!sequences || sequences.pricedCompletedEpisodes < 3) missing.push("At least 3 priced completed episodes");
  if (streak < 2) missing.push("A preceding winning streak of at least 2 episodes");
  if (expansion === null || expansion < 1.5) missing.push("Post-win position-size expansion of at least 1.5x");
  if (loss === null || loss > -0.2) missing.push("A subsequent loss of at least 20%");
  if (sequences && sequences.overextensionEvents === 0) {
    missing.push("Success, size expansion, and loss in the same episode sequence");
  }
  const eligible = (sequences?.overextensionEvents ?? 0) > 0;
  return result(
    "napoleon",
    sequenceMatch,
    sequences ? Math.min(100, 50 + sequences.pricedCompletedEpisodes * 5) : 0,
    eligible,
    sequences ? [
      evidence("WINNING STREAK", `${streak} episodes`, clamp01(streak / 5)),
      evidence("POSITION SIZE EXPANSION", expansion === null ? "UNKNOWN" : `${expansion.toFixed(2)}x`, expansion === null ? 0 : clamp01((expansion - 1) / 3)),
      evidence("LARGEST SUBSEQUENT LOSS", loss === null ? "UNKNOWN" : formatPercent(loss), loss === null ? 0 : clamp01(Math.abs(loss) / 0.8)),
      evidence("OVEREXTENSION EVENTS", String(sequences.overextensionEvents), clamp01(sequences.overextensionEvents / 3)),
    ] : [],
    missing,
  );
}

/** An eligible Persona still needs at least this Match to be assigned as winner. */
export const MIN_WINNING_MATCH = 50;

export function scorePersonas(
  profile: WalletBehaviorProfile,
  options: PersonaScoringOptions = {},
): PersonaRanking {
  const historyComplete = options.historyComplete ?? false;
  const qualifyingSwaps = profile.features.qualifyingSwapCount;
  const scores = [
    scoreSisyphus(profile, historyComplete),
    scoreNewton(profile, historyComplete),
    scoreCaesar(profile, historyComplete),
    scoreCroesus(profile, historyComplete),
    scoreIcarus(options.positionPerformance),
    scoreMidas(options.positionPerformance),
    scoreDonQuixote(options.positionPerformance),
    scoreNapoleon(options.tradeSequences),
  ].sort((a, b) => {
    if (a.match === null && b.match === null) return b.confidence - a.confidence;
    if (a.match === null) return 1;
    if (b.match === null) return -1;
    return b.match - a.match || b.confidence - a.confidence;
  });
  const eligibleScores = scores.filter((persona) => persona.eligible);
  const assignableScores = eligibleScores.filter((persona) => (persona.match ?? 0) >= MIN_WINNING_MATCH);
  const sufficientHistory = qualifyingSwaps >= GENERAL_MINIMUM_SWAPS;
  const resultReason: PersonaRanking["resultReason"] = !sufficientHistory
    ? "INSUFFICIENT_HISTORY"
    : eligibleScores.length === 0
      ? "NO_ELIGIBLE_PERSONA"
      : assignableScores.length === 0
        ? "NO_STRONG_MATCH"
        : null;
  return {
    scores,
    eligibleScores,
    // Eligibility alone never assigns a Persona: the winner must also clear
    // MIN_WINNING_MATCH, and the wallet needs the general history minimum.
    winner: sufficientHistory ? assignableScores[0] ?? null : null,
    runnerUp: sufficientHistory ? assignableScores[1] ?? null : null,
    dimensions: buildBehaviorScores(profile),
    qualifyingSwaps,
    requiredQualifyingSwaps: GENERAL_MINIMUM_SWAPS,
    resultReason,
  };
}

/**
 * Product routing over a finished ranking. Routing happens AFTER scoring and
 * never changes it: below the history minimum the wallet gets the Diogenes
 * special persona (no Match, no normal-persona participation); a finished
 * ranking with no assignable winner is PERSONA_INCONCLUSIVE — a state kept
 * strictly separate from the special persona.
 */
export function resolvePersonaOutcome(ranking: PersonaRanking): PersonaOutcome {
  if (ranking.qualifyingSwaps < ranking.requiredQualifyingSwaps) {
    return {
      kind: "SPECIAL_PERSONA",
      personaId: "diogenes",
      reason: "INSUFFICIENT_HISTORY",
      qualifyingSwaps: ranking.qualifyingSwaps,
      requiredQualifyingSwaps: ranking.requiredQualifyingSwaps,
    };
  }
  if (ranking.winner) {
    return {
      kind: "NORMAL_PERSONA",
      personaId: ranking.winner.personaId,
      // The winner gate requires match >= MIN_WINNING_MATCH, so a null match
      // can never win; the fallback only satisfies the nullable score type.
      match: ranking.winner.match ?? 0,
      confidence: ranking.winner.confidence,
      ranking,
    };
  }
  return {
    kind: "PERSONA_INCONCLUSIVE",
    reason: ranking.resultReason === "NO_ELIGIBLE_PERSONA" ? "NO_ELIGIBLE_PERSONA" : "NO_STRONG_MATCH",
    ranking,
  };
}
