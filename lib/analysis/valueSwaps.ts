import type { NormalizedTokenChange, NormalizedTransaction } from "./types";
import type { HistoricalPricingDiagnostics, SwapValuation } from "./valuationTypes";
import {
  getHistoricalPricesUsdWithDiagnostics,
  historicalPriceBucket,
  type HistoricalPriceLoadResult,
  type HistoricalPricePoint,
} from "../pricing/historicalPrice";

export const VERIFIED_USD_STABLECOIN_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

export const SOL_ASSET_MINTS = new Set([
  "SOL",
  "So11111111111111111111111111111111111111112", // WSOL
]);

export type ValueSwapsOptions = {
  loadSolPrices?: (
    timestamps: number[],
  ) => Promise<Map<number, HistoricalPricePoint | null> | HistoricalPriceLoadResult>;
};

export type ValueSwapsResult = {
  transactions: NormalizedTransaction[];
  valuations: SwapValuation[];
  historicalPricing: HistoricalPricingDiagnostics;
};

function diagnosticsForInjectedPrices(
  timestamps: number[],
  prices: Map<number, HistoricalPricePoint | null>,
): HistoricalPricingDiagnostics {
  const buckets = [...new Set(timestamps.map(historicalPriceBucket))];
  return {
    status: "OK",
    requestedTimestampCount: timestamps.length,
    resolvedTimestampCount: timestamps.filter((timestamp) =>
      prices.get(historicalPriceBucket(timestamp)) != null
    ).length,
    requestedBucketCount: buckets.length,
    resolvedBucketCount: buckets.filter((bucket) => prices.get(bucket) != null).length,
    coinbaseRequestCount: 0,
    coinbaseFailureCount: 0,
    coingeckoRequestCount: 0,
    coingeckoFailureCount: 0,
  };
}

function totalAmount(changes: NormalizedTokenChange[], acceptedMints: Set<string>) {
  return changes
    .filter((change) => acceptedMints.has(change.mint))
    .reduce((sum, change) => sum + change.amount, 0);
}

function completeSideUsdValue(changes: NormalizedTokenChange[]) {
  if (changes.length === 0 || changes.some((change) => change.usdValue === undefined)) return null;
  return changes.reduce((sum, change) => sum + Math.abs(change.usdValue ?? 0), 0);
}

function applyAnchorValues(
  changes: NormalizedTokenChange[],
  anchorMints: Set<string>,
  anchorUnitPriceUsd: number,
  oppositeDirection: "IN" | "OUT",
  swapUsdValue: number,
) {
  const next = changes.map((change) => anchorMints.has(change.mint)
    ? { ...change, usdValue: change.amount * anchorUnitPriceUsd }
    : { ...change });
  const oppositeIndexes = next.flatMap((change, index) =>
    change.direction === oppositeDirection ? [index] : []
  );
  if (oppositeIndexes.length === 1) {
    const index = oppositeIndexes[0];
    next[index] = { ...next[index], usdValue: swapUsdValue };
  }
  return next;
}

function applyPropagatedValue(
  changes: NormalizedTokenChange[],
  valuedDirection: "IN" | "OUT",
  swapUsdValue: number,
) {
  const oppositeDirection = valuedDirection === "IN" ? "OUT" : "IN";
  const indexes = changes.flatMap((change, index) =>
    change.direction === oppositeDirection ? [index] : []
  );
  if (indexes.length !== 1) return changes.map((change) => ({ ...change }));
  return changes.map((change, index) => index === indexes[0]
    ? { ...change, usdValue: swapUsdValue }
    : { ...change });
}

function sidePrice(changes: NormalizedTokenChange[], direction: "IN" | "OUT") {
  const side = changes.filter((change) => change.direction === direction);
  if (side.length !== 1 || side[0].usdValue === undefined || side[0].amount <= 0) return null;
  return Math.abs(side[0].usdValue) / side[0].amount;
}

function unknownValuation(transaction: NormalizedTransaction): SwapValuation {
  return {
    signature: transaction.signature,
    usdValue: null,
    inputPriceUsd: null,
    outputPriceUsd: null,
    source: "UNKNOWN",
    confidence: "LOW",
    timestamp: transaction.timestamp,
  };
}

export async function valueSwaps(
  transactions: NormalizedTransaction[],
  options: ValueSwapsOptions = {},
): Promise<ValueSwapsResult> {
  const swaps = transactions.filter((transaction) => transaction.type === "SWAP");
  const solTimestamps = swaps.flatMap((transaction) =>
    transaction.tokenChanges.some((change) => SOL_ASSET_MINTS.has(change.mint))
      && !transaction.tokenChanges.some((change) => VERIFIED_USD_STABLECOIN_MINTS.has(change.mint))
      ? [transaction.timestamp]
      : []
  );
  const loadSolPrices = options.loadSolPrices
    ?? ((timestamps: number[]) => getHistoricalPricesUsdWithDiagnostics("SOL", timestamps));
  const loadedSolPrices = solTimestamps.length > 0
    ? await loadSolPrices(solTimestamps)
    : new Map<number, HistoricalPricePoint | null>();
  const solPrices = loadedSolPrices instanceof Map ? loadedSolPrices : loadedSolPrices.prices;
  const historicalPricing = loadedSolPrices instanceof Map
    ? diagnosticsForInjectedPrices(solTimestamps, loadedSolPrices)
    : loadedSolPrices.diagnostics;
  const valuations: SwapValuation[] = [];

  const valuedTransactions = transactions.map((transaction): NormalizedTransaction => {
    if (transaction.type !== "SWAP") return transaction;
    const inbound = transaction.tokenChanges.filter((change) => change.direction === "IN");
    const outbound = transaction.tokenChanges.filter((change) => change.direction === "OUT");
    if (inbound.length === 0 || outbound.length === 0) {
      const valuation = unknownValuation(transaction);
      valuations.push(valuation);
      return { ...transaction, valuation };
    }

    const stableOut = totalAmount(outbound, VERIFIED_USD_STABLECOIN_MINTS);
    const stableIn = totalAmount(inbound, VERIFIED_USD_STABLECOIN_MINTS);
    let changes: NormalizedTokenChange[] | undefined;
    let usdValue: number | null = null;
    let source: SwapValuation["source"] = "UNKNOWN";
    let confidence: SwapValuation["confidence"] = "LOW";

    if (stableOut > 0 || stableIn > 0) {
      const anchorDirection = stableOut > 0 ? "OUT" as const : "IN" as const;
      usdValue = stableOut > 0 ? stableOut : stableIn;
      changes = applyAnchorValues(
        transaction.tokenChanges,
        VERIFIED_USD_STABLECOIN_MINTS,
        1,
        anchorDirection === "OUT" ? "IN" : "OUT",
        usdValue,
      );
      source = "STABLECOIN_EXECUTION";
      confidence = "HIGH";
    } else {
      const solOut = totalAmount(outbound, SOL_ASSET_MINTS);
      const solIn = totalAmount(inbound, SOL_ASSET_MINTS);
      const solPoint = solPrices.get(historicalPriceBucket(transaction.timestamp)) ?? null;
      if ((solOut > 0 || solIn > 0) && solPoint) {
        const anchorDirection = solOut > 0 ? "OUT" as const : "IN" as const;
        usdValue = (solOut > 0 ? solOut : solIn) * solPoint.priceUsd;
        changes = applyAnchorValues(
          transaction.tokenChanges,
          SOL_ASSET_MINTS,
          solPoint.priceUsd,
          anchorDirection === "OUT" ? "IN" : "OUT",
          usdValue,
        );
        source = "SOL_HISTORICAL_PRICE";
        confidence = "MEDIUM";
      } else {
        const outboundUsd = completeSideUsdValue(outbound);
        const inboundUsd = completeSideUsdValue(inbound);
        if (outboundUsd !== null || inboundUsd !== null) {
          const valuedDirection = outboundUsd !== null ? "OUT" as const : "IN" as const;
          usdValue = outboundUsd ?? inboundUsd;
          changes = applyPropagatedValue(transaction.tokenChanges, valuedDirection, usdValue ?? 0);
          source = "PROPAGATED_EXECUTION_PRICE";
          confidence = "MEDIUM";
        }
      }
    }

    if (!changes || usdValue === null || !Number.isFinite(usdValue) || usdValue <= 0) {
      const valuation = unknownValuation(transaction);
      valuations.push(valuation);
      return { ...transaction, tokenChanges: transaction.tokenChanges.map((change) => ({ ...change })), valuation };
    }

    const valuation: SwapValuation = {
      signature: transaction.signature,
      usdValue,
      inputPriceUsd: sidePrice(changes, "OUT"),
      outputPriceUsd: sidePrice(changes, "IN"),
      source,
      confidence,
      timestamp: transaction.timestamp,
    };
    valuations.push(valuation);
    return { ...transaction, tokenChanges: changes, valuation };
  });

  return { transactions: valuedTransactions, valuations, historicalPricing };
}
