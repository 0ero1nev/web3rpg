export type SwapValuationSource =
  | "STABLECOIN_EXECUTION"
  | "SOL_HISTORICAL_PRICE"
  | "PROPAGATED_EXECUTION_PRICE"
  | "EXTERNAL_TOKEN_PRICE"
  | "UNKNOWN";

export type SwapValuationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type HistoricalPricingStatus = "OK" | "PARTIAL" | "UNAVAILABLE";

export type HistoricalPricingFailureCategory =
  | "TIMEOUT"
  | "DNS"
  | "PROXY_CONNECTION"
  | "TLS"
  | "HTTP_429"
  | "HTTP_403"
  | "HTTP_5XX"
  | "HTTP_OTHER"
  | "INVALID_RESPONSE"
  | "NETWORK_OTHER";

export type HistoricalPricingDiagnostics = {
  status: HistoricalPricingStatus;
  requestedTimestampCount: number;
  resolvedTimestampCount: number;
  requestedBucketCount: number;
  resolvedBucketCount: number;
  coinbaseRequestCount: number;
  coinbaseFailureCount: number;
  coingeckoRequestCount: number;
  coingeckoFailureCount: number;
  /** Safe server diagnostic categories; never contains URLs, credentials, or raw errors. */
  failureCategories?: Partial<Record<HistoricalPricingFailureCategory, number>>;
};

export type SwapValuation = {
  signature: string;
  usdValue: number | null;
  inputPriceUsd: number | null;
  outputPriceUsd: number | null;
  source: SwapValuationSource;
  confidence: SwapValuationConfidence;
  timestamp: number;
};

export type SwapValuationSourceDistribution = Record<SwapValuationSource, number>;

export type SwapValuationSummary = {
  qualifyingSwapCount: number;
  valuedSwapCount: number;
  swapValuationCoverage: number;
  sourceCounts: SwapValuationSourceDistribution;
  historicalPricing: HistoricalPricingDiagnostics;
};
