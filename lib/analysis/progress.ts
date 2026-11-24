export const WALLET_ANALYSIS_STAGES = [
  "PREPARING",
  "FETCHING_TRANSACTIONS",
  "READING_SWAPS",
  "RECONSTRUCTING_POSITIONS",
  "VALUING_TRADES",
  "MATCHING_PERSONA",
  "PACKING_RESULT",
  "COMPLETE",
] as const;

export type WalletAnalysisStage = typeof WALLET_ANALYSIS_STAGES[number];

export type WalletAnalysisProgressEvent = {
  type: "progress";
  stage: WalletAnalysisStage;
};

export type WalletAnalysisFeedEvent = {
  type: "analysis_event";
  message: string;
};
