import type { NormalizedTransaction } from "./types";

export type DerivedMetric<T> = {
  value: T | null;
  coverage: number;
  sampleSize: number;
};

export type TradeSide = "BUY" | "SELL";
export type LedgerEventType = "BUY" | "ADD" | "PARTIAL_SELL" | "EXIT" | "RE_ENTRY";

export type CounterAsset = {
  mint: string;
  symbol?: string;
  amount: number;
  direction: "IN" | "OUT";
  usdValue?: number;
};

export type TradeLeg = {
  signature: string;
  timestamp: number;
  side: TradeSide;
  eventType: LedgerEventType;
  mint: string;
  symbol?: string;
  amount: number;
  usdValue?: number;
  unitPriceUsd?: number;
  counterAssets: CounterAsset[];
  realizedPnlUsd: number | null;
};

export type HoldingPeriod = {
  openedAt: number;
  closedAt?: number;
  durationSeconds?: number;
  openingStateUnknown: boolean;
};

/** Aggregate counts of reconstructed position actions (swap legs only; transfers and airdrops never produce legs). */
export type PositionActionCounts = {
  buyLegCount: number;
  addLegCount: number;
  partialSellLegCount: number;
  exitLegCount: number;
  reentryLegCount: number;
  disposalLegCount: number;
  cyclingLegCount: number;
};

/** Wallet-level repeated-interaction statistics across traded assets. */
export type AssetInteractionStats = {
  tradedAssetCount: number;
  meanTradeLegsPerAsset: number;
  medianTradeLegsPerAsset: number;
  /** Fraction of traded assets with more than one trade leg. */
  repeatedAssetRate: number;
  /** Fraction of traded assets with at least three trade legs. */
  highlyRepeatedAssetRate: number;
};

/**
 * Terminal-state classification of reconstructed position episodes. An
 * unresolved disappearance means ONLY that the transaction window cannot
 * establish the terminal state — it is never evidence of selling, holding,
 * profit, or loss.
 */
export type EpisodeTerminalStateCounts = {
  observedOpenEpisodeCount: number;
  observedExitEpisodeCount: number;
  unresolvedDisappearanceEpisodeCount: number;
  unknownOpeningStateEpisodeCount: number;
};

export type ReentryEvent = {
  mint: string;
  exitAt: number;
  reentryAt: number;
  exitPriceUsd?: number;
  reentryPriceUsd?: number;
  timeBetweenSeconds: number;
  reenteredHigher?: boolean;
};

export type TokenLedger = {
  mint: string;
  symbol?: string;
  firstTradeAt: number;
  lastTradeAt: number;
  buys: TradeLeg[];
  sells: TradeLeg[];
  totalBought: number;
  totalSold: number;
  currentTrackedAmount: number;
  buyCount: number;
  sellCount: number;
  holdingPeriods: HoldingPeriod[];
  reentries: ReentryEvent[];
  openingStateUnknown: boolean;
  trackingStateUnknown: boolean;
  averageCostUsd: number | null;
  realizedPnlUsd: DerivedMetric<number>;
  events: TradeLeg[];
};

export type ReconstructionOptions = {
  historyComplete?: boolean;
  absoluteDustThreshold?: number;
  relativeDustThreshold?: number;
};

export type PositionReconstruction = {
  qualifyingSwapCount: number;
  ignoredSwapCount: number;
  qualifyingSwaps: NormalizedTransaction[];
  ledgers: TokenLedger[];
  dustRule: {
    absoluteThreshold: number;
    relativeThreshold: number;
  };
};

export type WalletBehaviorFeatures = {
  qualifyingSwapCount: number;
  tradedTokenCount: number;
  buyCount: number;
  sellCount: number;
  completedPositionCount: number;
  openPositionCount: number;
  reentryCount: number;
  avgTradesPerToken: number;
  totalVolumeUsd: DerivedMetric<number>;
  realizedPnlUsd: DerivedMetric<number>;
  avgHoldDurationSeconds: DerivedMetric<number>;
  medianHoldDurationSeconds: DerivedMetric<number>;
  largestPositionShare: DerivedMetric<number>;
  concentrationScore: DerivedMetric<number>;
  turnoverScore: DerivedMetric<number>;
  activityScore: DerivedMetric<number>;
  profitTakingScore: DerivedMetric<number>;
  convictionScore: DerivedMetric<number>;
  progressEfficiency: DerivedMetric<number>;
  positionActions: PositionActionCounts;
  assetInteraction: AssetInteractionStats;
  episodeTerminalStates: EpisodeTerminalStateCounts;
};

export type WalletBehaviorProfile = {
  features: WalletBehaviorFeatures;
  ledgers: TokenLedger[];
  reconstruction: PositionReconstruction;
};
