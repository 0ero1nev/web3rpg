import type { PositionPerformance, PositionPerformanceSummary } from "./positionPerformance";

export type OverextensionEvent = {
  lossPositionId: string;
  lossMint: string;
  winningStreakLength: number;
  positionSizeExpansionRatio: number;
  subsequentLossReturnPct: number;
};

export type TradeSequenceAnalysis = {
  winningStreakLength: number;
  positionSizeExpansionRatio: number | null;
  postWinRiskExpansion: number | null;
  largestSubsequentLoss: number | null;
  overextensionEvents: number;
  pricedCompletedEpisodes: number;
  events: OverextensionEvent[];
};

const MIN_WINNING_STREAK = 2;
const MIN_EXPANSION_RATIO = 1.5;
const LARGE_LOSS_RETURN = -0.2;

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isPricedCompleted(position: PositionPerformance) {
  return position.status === "CLOSED"
    && position.entryValueUsd !== null
    && position.entryValueUsd > 0
    && position.realizedReturnPct !== null;
}

/** Detects success -> size expansion -> loss sequences from completed episodes. */
export function analyzeTradeSequences(
  summary: PositionPerformanceSummary,
): TradeSequenceAnalysis {
  const completed = summary.positions
    .filter(isPricedCompleted)
    .sort((left, right) =>
      (left.closedAt ?? left.openedAt) - (right.closedAt ?? right.openedAt)
      || left.id.localeCompare(right.id)
    );
  let streak: PositionPerformance[] = [];
  let maximumStreak = 0;
  let largestExpansion: number | null = null;
  let largestSubsequentLoss: number | null = null;
  let postWinCandidates = 0;
  let expandedCandidates = 0;
  const events: OverextensionEvent[] = [];

  for (const position of completed) {
    const positionReturn = position.realizedReturnPct ?? 0;
    if (positionReturn > 0) {
      const previousWinner = streak[streak.length - 1];
      // A win can influence later risk only after it has actually been realized.
      streak = !previousWinner
        || position.openedAt >= (previousWinner.closedAt ?? previousWinner.openedAt)
        ? [...streak, position]
        : [position];
      maximumStreak = Math.max(maximumStreak, streak.length);
      continue;
    }

    const lastWinner = streak[streak.length - 1];
    const openedAfterWins = !lastWinner
      || position.openedAt >= (lastWinner.closedAt ?? lastWinner.openedAt);
    if (
      streak.length >= MIN_WINNING_STREAK
      && openedAfterWins
      && position.entryValueUsd !== null
    ) {
      postWinCandidates += 1;
      const baseline = mean(streak.map((winner) => winner.entryValueUsd ?? 0));
      const expansion = baseline > 0 ? position.entryValueUsd / baseline : null;
      if (expansion !== null) {
        largestExpansion = largestExpansion === null
          ? expansion
          : Math.max(largestExpansion, expansion);
        if (expansion >= MIN_EXPANSION_RATIO) expandedCandidates += 1;
      }
      largestSubsequentLoss = largestSubsequentLoss === null
        ? positionReturn
        : Math.min(largestSubsequentLoss, positionReturn);
      if (
        expansion !== null
        && expansion >= MIN_EXPANSION_RATIO
        && positionReturn <= LARGE_LOSS_RETURN
      ) {
        events.push({
          lossPositionId: position.id,
          lossMint: position.mint,
          winningStreakLength: streak.length,
          positionSizeExpansionRatio: expansion,
          subsequentLossReturnPct: positionReturn,
        });
      }
    }
    streak = [];
  }

  return {
    winningStreakLength: maximumStreak,
    positionSizeExpansionRatio: largestExpansion,
    postWinRiskExpansion: postWinCandidates > 0 ? expandedCandidates / postWinCandidates : null,
    largestSubsequentLoss,
    overextensionEvents: events.length,
    pricedCompletedEpisodes: completed.length,
    events,
  };
}

export const NAPOLEON_SEQUENCE_THRESHOLDS = {
  minimumWinningStreak: MIN_WINNING_STREAK,
  minimumExpansionRatio: MIN_EXPANSION_RATIO,
  largeLossReturn: LARGE_LOSS_RETURN,
} as const;
