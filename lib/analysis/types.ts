import type { PositionPerformanceSummary } from "./positionPerformance";
import type { TradeSequenceAnalysis } from "./tradeSequences";
import type { PriceCoverageValidation } from "./priceCoverageValidation";
import type { SwapValuation, SwapValuationSummary } from "./valuationTypes";
import type { HistoricalPricingStatus } from "./valuationTypes";
import type {
  AssetInteractionStats,
  EpisodeTerminalStateCounts,
  PositionActionCounts,
} from "./behaviorTypes";
import type { PersonaOutcome, PersonaRanking } from "../persona/personaTypes";
import type { PersonaResult } from "../persona/personaResult";
import type { SolWsolNormalization } from "../solana/solWsolFlows";

export type NormalizedTransactionType = "SWAP" | "TRANSFER" | "OTHER";

export type TokenDirection = "IN" | "OUT";

export type NormalizedTokenChange = {
  mint: string;
  symbol?: string;
  amount: number;
  direction: TokenDirection;
  usdValue?: number;
};

export type NormalizedTransaction = {
  signature: string;
  timestamp: number;
  type: NormalizedTransactionType;
  feeUsd?: number;
  networkFeeSol?: number;
  /** Provider-agnostic venue label, when the upstream parser can identify it. */
  source?: string;
  /** Top-level Solana programs invoked by the transaction. */
  programIds?: string[];
  tokenChanges: NormalizedTokenChange[];
  valuation?: SwapValuation;
  solWsolNormalization?: SolWsolNormalization;
};

export type TokenHolding = {
  mint: string;
  symbol?: string;
  amount: number;
  usdValue?: number;
};

export type WalletProfile = {
  address: string;
  walletValueUsd?: number;
  transactionCount: number;
  analyzedTransactionCount: number;
  firstActivityAt?: number;
  lastActivityAt?: number;
  holdings: TokenHolding[];
  transactions: NormalizedTransaction[];
  valuationSummary?: SwapValuationSummary;
  positionPerformance?: PositionPerformanceSummary;
  tradeSequences?: TradeSequenceAnalysis;
  personaRanking?: PersonaRanking;
  personaOutcome?: PersonaOutcome;
  /** Product-facing card/result model (normal persona, special persona, or inconclusive). */
  personaResult?: PersonaResult;
  priceValidation?: PriceCoverageValidation;
  /** Position-action telemetry from the reconstruction state machine. */
  positionTelemetry?: {
    actions: PositionActionCounts;
    assetInteraction: AssetInteractionStats;
    episodes: EpisodeTerminalStateCounts;
  };
  dataQuality: {
    historyComplete: boolean;
    pricingCoverage: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
    historicalPricingStatus: HistoricalPricingStatus;
    degradedReasons: Array<"HISTORICAL_PRICING_UNAVAILABLE">;
  };
};

export type WalletAnalysisErrorCode =
  | "INVALID_ADDRESS"
  | "NO_HISTORY"
  | "RATE_LIMITED"
  | "UPSTREAM_RATE_LIMITED"
  | "SERVER_BUSY"
  | "PROVIDER_ERROR"
  | "PARTIAL_HISTORY";

export type WalletAnalysisErrorResponse = {
  code: WalletAnalysisErrorCode;
  message: string;
  profile?: WalletProfile;
};
