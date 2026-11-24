import { getPersonaDefinition } from "@/data/personaDefinitions";
import { buildDiogenesCardData, DIOGENES } from "@/data/specialPersonas";
import { getRarity } from "@/lib/personaRarity";
import type { WalletBehaviorFeatures, WalletBehaviorProfile } from "../analysis/behaviorTypes";
import type { PositionPerformance, PositionPerformanceSummary } from "../analysis/positionPerformance";
import type { TradeSequenceAnalysis } from "../analysis/tradeSequences";
import type { PersonaId, PersonaOutcome, PersonaRanking } from "./personaTypes";
import { buildNewtonStoryData, type NewtonStoryData } from "./newtonStory";
import { buildDonQuixoteStoryData, type DonQuixoteStoryData } from "./donQuixoteStory";
import { buildIcarusStoryData, type IcarusStoryData } from "./icarusStory";
import type { PersonaCardData, PersonaMetric, PersonaRarity } from "../../types/persona";

/**
 * Product-facing result model. Exactly three kinds; internal scoring details
 * (dimension tables, cost reports, gates) never surface here. Unmeasurable
 * metrics display UNKNOWN instead of a fabricated number.
 */
export type PersonaResultEvidence = { label: string; value: string };

export type NormalPersonaResult = PersonaCardData & {
  kind: "NORMAL_PERSONA";
  personaId: PersonaId;
  match: number;
  rarity: PersonaRarity;
  confidence: number;
  /** Wallet behavior evidence for the WHY view — real matched observations only. */
  evidence: PersonaResultEvidence[];
  /** Historical archetype story, kept strictly separate from wallet evidence. */
  story: string[];
  /** Newton-only post-reveal story. */
  newtonStory?: NewtonStoryData;
  /** Icarus-only evidence-audited story report. */
  icarusStory?: IcarusStoryData;
  donQuixoteStory?: DonQuixoteStoryData;
};

export type SpecialPersonaResult = Omit<PersonaCardData, "match" | "rarity"> & {
  kind: "SPECIAL_PERSONA";
  personaId: "diogenes";
  reason: "INSUFFICIENT_HISTORY";
  qualifyingSwaps: number;
};

export type InconclusivePersonaResult = {
  kind: "INCONCLUSIVE";
  reason: "NO_ELIGIBLE_PERSONA" | "NO_STRONG_MATCH" | "HISTORICAL_PRICING_UNAVAILABLE";
  qualifyingSwaps: number;
};

export type PersonaResult = NormalPersonaResult | SpecialPersonaResult | InconclusivePersonaResult;

export type PersonaResultInput = {
  outcome: PersonaOutcome;
  ranking: PersonaRanking;
  features: WalletBehaviorFeatures;
  positionPerformance?: PositionPerformanceSummary;
  tradeSequences?: TradeSequenceAnalysis;
  walletValueUsd?: number;
  topHoldingUsd?: number;
  walletPricingCoverage?: number;
  behavior?: WalletBehaviorProfile;
  historyComplete?: boolean;
};

const UNKNOWN = "UNKNOWN";

function reliable(value: { value: number | null; coverage: number }): number | null {
  return value.coverage >= 1 ? value.value : null;
}

function formatUsd(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPlainUsd(value: number | null | undefined): string | null {
  const signed = formatUsd(value);
  return signed === null ? null : signed.replace(/^[+-]/, "");
}

function formatPercent(value: number | null | undefined, digits = 1): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function formatDays(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const days = seconds / 86_400;
  if (days >= 10) return `${days.toFixed(0)}d`;
  if (days >= 1) return `${days.toFixed(1)}d`;
  return `${(seconds / 3_600).toFixed(1)}h`;
}

function metric(label: string, value: string | null, normalizedValue?: number): PersonaMetric {
  return {
    label,
    displayValue: value ?? UNKNOWN,
    ...(value === null || normalizedValue === undefined ? {} : { normalizedValue: Math.max(0, Math.min(100, normalizedValue)) }),
  };
}

function dimensionValue(ranking: PersonaRanking, id: keyof PersonaRanking["dimensions"]): number | null {
  return ranking.dimensions[id]?.value ?? null;
}

function worstOpenLoser(positions: PositionPerformance[]): PositionPerformance | null {
  const losers = positions.filter((position) =>
    position.status === "OPEN" && position.unrealizedReturnPct !== null && position.unrealizedReturnPct < 0);
  if (losers.length === 0) return null;
  return losers.reduce((worst, position) =>
    (position.unrealizedReturnPct ?? 0) < (worst.unrealizedReturnPct ?? 0) ? position : worst);
}

function topOpenWinner(positions: PositionPerformance[]): PositionPerformance | null {
  const winners = positions.filter((position) =>
    position.status === "OPEN" && position.unrealizedPnlUsd !== null && position.unrealizedPnlUsd > 0);
  if (winners.length === 0) return null;
  return winners.reduce((best, position) =>
    (position.unrealizedPnlUsd ?? 0) > (best.unrealizedPnlUsd ?? 0) ? position : best);
}

function strongestPricedEpisode(positions: PositionPerformance[]): PositionPerformance | null {
  const priced = positions.filter((position) => position.peakPriceUsd !== null && position.entryPriceUsd !== null);
  if (priced.length === 0) return null;
  return priced.reduce((best, position) =>
    ((position.peakReturnPct ?? -Infinity)) > ((best.peakReturnPct ?? -Infinity)) ? position : best);
}

const roundScore = (value: number | null) => (value === null ? null : Math.round(value));

/** Wallet-derived metric sets per persona; identity labels are fixed. */
export function buildPersonaMetrics(personaId: string, input: PersonaResultInput): PersonaMetric[] {
  const { features, ranking, positionPerformance, tradeSequences, walletValueUsd, topHoldingUsd, walletPricingCoverage } = input;
  const positions = positionPerformance?.positions ?? [];
  switch (personaId) {
    case "newton": {
      const fomo = dimensionValue(ranking, "FOMO_REENTRY");
      return [
        metric("EXIT TIMING", formatDays(reliable(features.medianHoldDurationSeconds)), dimensionValue(ranking, "HOLDING") ?? undefined),
        metric("FOMO RESISTANCE", fomo === null ? null : String(Math.round(100 - fomo)), fomo === null ? undefined : 100 - fomo),
        metric("RE-ENTRY CONTROL", features.completedPositionCount > 0 ? String(features.reentryCount) : null, 100 - (dimensionValue(ranking, "REENTRY") ?? 100)),
        metric("RECOVERY", formatUsd(reliable(features.realizedPnlUsd)), dimensionValue(ranking, "PROFITABILITY") ?? undefined),
      ];
    }
    case "icarus": {
      const episode = strongestPricedEpisode(positions);
      const giveback = episode?.givebackPct ?? null;
      return [
        metric("PEAK RETURN", formatPercent(episode?.peakReturnPct ?? null), episode?.peakReturnPct === null || episode?.peakReturnPct === undefined ? undefined : Math.min(100, (episode.peakReturnPct / 4) * 100)),
        metric("REALIZED RETURN", formatPercent(episode?.status === "CLOSED" ? episode.realizedReturnPct : null)),
        metric("EXIT DISCIPLINE", giveback === null ? null : String(Math.round(Math.max(0, 1 - giveback) * 100)), giveback === null ? undefined : Math.max(0, 1 - giveback) * 100),
        metric("ALTITUDE LOST", giveback === null ? null : `${(giveback * 100).toFixed(0)}%`, giveback === null ? undefined : Math.min(100, giveback * 100)),
      ];
    }
    case "midas": {
      const winner = topOpenWinner(positions);
      return [
        metric("UNREALIZED PNL", formatUsd(winner?.unrealizedPnlUsd ?? null)),
        metric("REALIZED PNL", formatUsd(reliable(features.realizedPnlUsd))),
        metric("HOLDING POWER", formatDays(winner?.holdingDuration ?? null), features.profitTakingScore.value ?? undefined),
        metric("PROFIT TAKING", roundScore(reliable(features.profitTakingScore))?.toString() ?? null, features.profitTakingScore.value ?? undefined),
      ];
    }
    case "sisyphus":
      return [
        metric("TOTAL TRADES", String(features.qualifyingSwapCount), dimensionValue(ranking, "ACTIVITY") ?? undefined),
        metric("TOTAL VOLUME", formatPlainUsd(reliable(features.totalVolumeUsd))),
        metric("NET PNL", formatUsd(reliable(features.realizedPnlUsd))),
        metric("PROGRESS", formatPercent(reliable(features.progressEfficiency), 2)),
      ];
    case "don_quixote": {
      const loser = worstOpenLoser(positions);
      return [
        metric("TOKEN DOWN", formatPercent(loser?.unrealizedReturnPct ?? null)),
        metric("HOLDING DAYS", formatDays(loser?.holdingDuration ?? null)),
        metric("AVG ENTRY", loser?.entryPriceUsd == null ? null : `$${loser.entryPriceUsd.toPrecision(3)}`),
        metric("CONVICTION", roundScore(reliable(features.convictionScore))?.toString() ?? null, features.convictionScore.value ?? undefined),
      ];
    }
    case "caesar":
      return [
        metric("LARGEST POSITION", formatPercent(reliable(features.largestPositionShare)), (features.largestPositionShare.value ?? 0) * 100),
        metric("POSITION GROWTH", `${features.positionActions.addLegCount} ADDS`, dimensionValue(ranking, "RISK_EXPANSION") ?? undefined),
        metric("CONVICTION", roundScore(reliable(features.convictionScore))?.toString() ?? null, features.convictionScore.value ?? undefined),
        metric("DIVERSIFICATION", `${features.tradedTokenCount} TOKENS`, dimensionValue(ranking, "DIVERSIFICATION") ?? undefined),
      ];
    case "napoleon":
      return [
        metric("WIN STREAK", tradeSequences ? String(Math.max(tradeSequences.winningStreakLength, ...tradeSequences.events.map((event) => event.winningStreakLength))) : null),
        metric("RISK EXPOSURE", tradeSequences?.positionSizeExpansionRatio == null ? null : `${tradeSequences.positionSizeExpansionRatio.toFixed(2)}x`),
        metric("LARGEST LOSS", formatPercent(tradeSequences?.largestSubsequentLoss ?? null)),
        metric("OVERCONFIDENCE", tradeSequences ? String(tradeSequences.overextensionEvents) : null),
      ];
    case "croesus":
      const holdingsAreFullyPriced = walletPricingCoverage === 1;
      const averageTradeSize = features.totalVolumeUsd.coverage >= 1
        && features.totalVolumeUsd.value !== null
        && features.totalVolumeUsd.sampleSize > 0
        ? features.totalVolumeUsd.value / features.totalVolumeUsd.sampleSize
        : null;
      return [
        metric("WALLET SIZE", formatPlainUsd(holdingsAreFullyPriced ? walletValueUsd : null)),
        metric("AVG TRADE SIZE", formatPlainUsd(averageTradeSize), dimensionValue(ranking, "TRADE_SIZE") ?? undefined),
        metric("TOP HOLDING", formatPlainUsd(holdingsAreFullyPriced ? topHoldingUsd : null)),
        metric("WHALE SCORE", roundScore(ranking.scores.find((score) => score.personaId === "croesus")?.match ?? null)?.toString() ?? null, ranking.scores.find((score) => score.personaId === "croesus")?.match ?? undefined),
      ];
    default:
      return [];
  }
}

export function buildDiogenesResult(qualifyingSwaps: number): SpecialPersonaResult {
  return {
    ...buildDiogenesCardData(qualifyingSwaps),
    kind: "SPECIAL_PERSONA",
    personaId: "diogenes",
    reason: "INSUFFICIENT_HISTORY",
    qualifyingSwaps,
  };
}

export function buildPersonaResult(input: PersonaResultInput): PersonaResult {
  const { outcome } = input;
  if (outcome.kind === "SPECIAL_PERSONA") {
    return buildDiogenesResult(outcome.qualifyingSwaps);
  }
  if (outcome.kind === "NORMAL_PERSONA") {
    // Definition ids use hyphens ("don-quixote") while scoring ids use
    // underscores ("don_quixote"); accept either form.
    const definition = getPersonaDefinition(outcome.personaId)
      ?? getPersonaDefinition(outcome.personaId.replace(/_/g, "-"));
    if (!definition) {
      return {
        kind: "INCONCLUSIVE",
        reason: "NO_STRONG_MATCH",
        qualifyingSwaps: input.ranking.qualifyingSwaps,
      };
    }
    const winner = input.ranking.scores.find((score) => score.personaId === outcome.personaId);
    const newtonStory = outcome.personaId === "newton" && input.behavior
      ? buildNewtonStoryData({
          match: outcome.match,
          historyComplete: input.historyComplete ?? false,
          ledgers: input.behavior.ledgers,
        })
      : undefined;
    const icarusStory = outcome.personaId === "icarus" && input.behavior
      ? buildIcarusStoryData({
          match: outcome.match,
          historyComplete: input.historyComplete ?? false,
          positionPerformance: input.positionPerformance,
          ledgers: input.behavior.ledgers,
        })
      : undefined;
    return {
      kind: "NORMAL_PERSONA",
      id: definition.id,
      name: definition.name,
      subtitle: definition.subtitle,
      artwork: definition.artwork,
      match: outcome.match,
      rarity: getRarity(outcome.match),
      metrics: buildPersonaMetrics(outcome.personaId, input),
      quote: [...definition.quote],
      personaId: outcome.personaId,
      confidence: outcome.confidence,
      evidence: (winner?.evidence ?? []).map((item) => ({
        label: item.label,
        value: item.value,
      })),
      story: [...definition.quote],
      ...(newtonStory ? { newtonStory } : {}),
      ...(icarusStory ? { icarusStory } : {}),
      ...(outcome.personaId === "don_quixote" ? {
        donQuixoteStory: buildDonQuixoteStoryData({
          match: outcome.match,
          positionPerformance: input.positionPerformance,
          ledgers: input.behavior?.ledgers,
        }),
      } : {}),
    };
  }
  return {
    kind: "INCONCLUSIVE",
    reason: outcome.reason,
    qualifyingSwaps: outcome.ranking.qualifyingSwaps,
  };
}

export const DIOGENES_DEFINITION = DIOGENES;
