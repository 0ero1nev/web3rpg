import "server-only";

import type { WalletAnalysisErrorCode, WalletProfile } from "@/lib/analysis/types";
import { buildWalletBehaviorProfile } from "@/lib/analysis/behaviorFeatures";
import { normalizeHoldings, normalizeTransactions } from "@/lib/analysis/normalizeTransactions";
import { buildPositionPerformance } from "@/lib/analysis/positionPerformance";
import { buildPriceCoverageValidation } from "@/lib/analysis/priceCoverageValidation";
import { analyzeTradeSequences } from "@/lib/analysis/tradeSequences";
import {
  applyHistoricalPricingAvailability,
  isMaterialHistoricalPricingOutage,
} from "@/lib/analysis/pricingAvailability";
import { valueSwaps } from "@/lib/analysis/valueSwaps";
import type {
  SwapValuationSource,
  SwapValuationSourceDistribution,
} from "@/lib/analysis/valuationTypes";
import {
  fetchHeliusWalletData,
  HeliusError,
  MAX_TRANSACTIONS,
} from "@/lib/solana/helius";
import { scorePersonas, resolvePersonaOutcome } from "@/lib/persona/personaScoring";
import { buildPersonaResult } from "@/lib/persona/personaResult";
import type { WalletAnalysisStage } from "@/lib/analysis/progress";
import { runWithColdAnalysisSlot } from "@/lib/security/publicAnalysis";

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;

function cacheSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function cacheTtlMs() {
  return cacheSetting("ANALYSIS_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS, 1_000, 86_400_000);
}

function cacheMaxEntries() {
  return cacheSetting("ANALYSIS_CACHE_MAX_ENTRIES", DEFAULT_CACHE_MAX_ENTRIES, 1, 100_000);
}

type CacheEntry = {
  expiresAt: number;
  profile: WalletProfile;
};

/** Infrastructure-degraded profiles are transient and must never become wallet truth. */
export function shouldCacheWalletProfile(profile: WalletProfile): boolean {
  const historicalFailures = profile.valuationSummary
    ? profile.valuationSummary.historicalPricing.coinbaseFailureCount
      + profile.valuationSummary.historicalPricing.coingeckoFailureCount
    : 0;
  const tokenProviderFailures = profile.positionPerformance?.costReport.providerFailures ?? 0;
  return profile.dataQuality.historicalPricingStatus === "OK"
    && historicalFailures === 0
    && tokenProviderFailures === 0
    && (profile.personaResult?.kind !== "INCONCLUSIVE"
      || profile.personaResult.reason !== "HISTORICAL_PRICING_UNAVAILABLE");
}

type ProfileCacheHooks = {
  onCached?: (profile: WalletProfile) => void;
  onPending?: () => void;
  onPendingResolved?: (profile: WalletProfile) => void;
};

/** Shared by production and regression tests so outage/recovery exercises the real cache path. */
export async function resolveWalletProfileWithCache(
  address: string,
  build: () => Promise<WalletProfile>,
  hooks: ProfileCacheHooks = {},
): Promise<WalletProfile> {
  const now = Date.now();
  const cached = profileCache.get(address);
  if (cached && cached.expiresAt > now) {
    hooks.onCached?.(cached.profile);
    return cached.profile;
  }
  if (cached) profileCache.delete(address);

  const pending = pendingProfiles.get(address);
  if (pending) {
    hooks.onPending?.();
    const profile = await pending;
    hooks.onPendingResolved?.(profile);
    return profile;
  }

  const request = runWithColdAnalysisSlot(build)
    .then((profile) => {
      // Cache successful and ordinary partial-history analyses. A historical
      // pricing outage materially removes Persona evidence, so the next request
      // must be allowed to recompute immediately after provider recovery.
      if (shouldCacheWalletProfile(profile)) {
        const maximum = cacheMaxEntries();
        while (profileCache.size >= maximum) {
          const oldest = profileCache.keys().next().value as string | undefined;
          if (!oldest) break;
          profileCache.delete(oldest);
        }
        profileCache.set(address, { profile, expiresAt: Date.now() + cacheTtlMs() });
      }
      return profile;
    })
    .finally(() => pendingProfiles.delete(address));

  pendingProfiles.set(address, request);
  return request;
}

const analysisGlobal = globalThis as typeof globalThis & {
  __web3rpgProfileCache?: Map<string, CacheEntry>;
  __web3rpgPendingProfiles?: Map<string, Promise<WalletProfile>>;
};
// globalThis survives development hot reloads and repeated route-module loads.
// The TTL remains unchanged, so this only removes accidental cache loss.
const profileCache = analysisGlobal.__web3rpgProfileCache ??= new Map<string, CacheEntry>();
const pendingProfiles = analysisGlobal.__web3rpgPendingProfiles ??= new Map<string, Promise<WalletProfile>>();
const VALUATION_SOURCES: SwapValuationSource[] = [
  "STABLECOIN_EXECUTION",
  "SOL_HISTORICAL_PRICE",
  "PROPAGATED_EXECUTION_PRICE",
  "EXTERNAL_TOKEN_PRICE",
  "UNKNOWN",
];

export class WalletAnalysisError extends Error {
  constructor(
    public readonly code: WalletAnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletAnalysisError";
  }
}

function pricingCoverage(profileHoldings: WalletProfile["holdings"]): number {
  const relevant = profileHoldings.filter((holding) => holding.amount !== 0);
  if (relevant.length === 0) return 0;
  const priced = relevant.filter((holding) => holding.usdValue !== undefined).length;
  return Number((priced / relevant.length).toFixed(4));
}

function confidenceFor(
  historyComplete: boolean,
  coverage: number,
  analyzedTransactionCount: number,
): WalletProfile["dataQuality"]["confidence"] {
  if (!historyComplete) return "LOW";
  if (coverage >= 0.8 && analyzedTransactionCount >= 10) return "HIGH";
  if (coverage >= 0.5 || analyzedTransactionCount > 0) return "MEDIUM";
  return "LOW";
}

type WalletProfileBuildOptions = {
  onProgress?: (stage: WalletAnalysisStage) => void;
  onEvent?: (message: string) => void;
};

function countLabel(value: number, label: string) {
  return `${new Intl.NumberFormat("en-US").format(value)} ${label}`;
}

function compactUsd(value: number) {
  return `$${new Intl.NumberFormat("en-US", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000 ? 1 : value >= 100 ? 0 : 2,
  }).format(value)}`;
}

function emitStoredProfileEvents(profile: WalletProfile, options: WalletProfileBuildOptions) {
  options.onEvent?.("WALLET FOUND");
  options.onEvent?.(countLabel(profile.analyzedTransactionCount, "TRANSACTIONS SCANNED"));
  if (profile.valuationSummary) options.onEvent?.(countLabel(profile.valuationSummary.qualifyingSwapCount, "TRADES DETECTED"));
  if (profile.positionTelemetry) {
    options.onEvent?.(countLabel(profile.positionTelemetry.assetInteraction.tradedAssetCount, "TOKENS TRADED"));
    options.onEvent?.(countLabel(profile.positionTelemetry.actions.reentryLegCount, "RE-ENTRIES FOUND"));
  }
  if (profile.positionPerformance) options.onEvent?.(countLabel(profile.positionPerformance.positions.length, "POSITIONS RECONSTRUCTED"));
  options.onEvent?.("LOOKING FOR TRADING PATTERNS...");
  options.onEvent?.("TRADING PATTERN FOUND");
  options.onEvent?.("COMPARING 8 PERSONAS...");
  options.onEvent?.("MATCH LOCKED");
  options.onEvent?.("PACKING YOUR CARD...");
}

async function buildUncachedWalletProfile(address: string, options: WalletProfileBuildOptions = {}): Promise<WalletProfile> {
  options.onProgress?.("PREPARING");
  let raw;
  try {
    options.onProgress?.("FETCHING_TRANSACTIONS");
    raw = await fetchHeliusWalletData(address, MAX_TRANSACTIONS);
  } catch (error) {
    if (error instanceof HeliusError) {
      throw new WalletAnalysisError(
        error.kind === "RATE_LIMITED" ? "UPSTREAM_RATE_LIMITED" : "PROVIDER_ERROR",
        error.message,
      );
    }
    throw new WalletAnalysisError("PROVIDER_ERROR", "Wallet provider request failed.");
  }

  if (raw.transactions.length === 0) {
    throw new WalletAnalysisError("NO_HISTORY", "No transaction history was found for this wallet.");
  }
  options.onEvent?.("WALLET FOUND");
  options.onEvent?.(countLabel(raw.transactions.length, "TRANSACTIONS SCANNED"));
  options.onProgress?.("READING_SWAPS");
  const holdings = normalizeHoldings(raw.balances);
  const normalizedTransactions = normalizeTransactions(raw.transactions, holdings);
  const valued = await valueSwaps(normalizedTransactions);
  const transactions = valued.transactions;
  options.onProgress?.("RECONSTRUCTING_POSITIONS");
  const behavior = buildWalletBehaviorProfile(transactions, {
    historyComplete: raw.historyComplete,
  });
  const reconstructed = behavior.reconstruction;
  options.onEvent?.(countLabel(reconstructed.qualifyingSwapCount, "TRADES DETECTED"));
  options.onEvent?.(countLabel(behavior.features.tradedTokenCount, "TOKENS TRADED"));
  options.onEvent?.(countLabel(behavior.features.completedPositionCount + behavior.features.openPositionCount, "POSITIONS RECONSTRUCTED"));
  options.onEvent?.(countLabel(behavior.features.reentryCount, "RE-ENTRIES FOUND"));
  options.onProgress?.("VALUING_TRADES");
  options.onEvent?.("CHECKING YOUR WINS & LOSSES...");
  const positionPerformance = await buildPositionPerformance(behavior, holdings, {
    historyComplete: raw.historyComplete,
  });
  const tradeSequences = analyzeTradeSequences(positionPerformance);
  const priceValidation = buildPriceCoverageValidation(positionPerformance);
  const volume = behavior.features.totalVolumeUsd;
  if (volume.value !== null && volume.value > 0 && volume.coverage >= .8) {
    options.onEvent?.(`${compactUsd(volume.value)} TRADING VOLUME ANALYZED`);
  }
  options.onEvent?.("LOOKING FOR TRADING PATTERNS...");
  options.onEvent?.("TRADING PATTERN FOUND");
  options.onProgress?.("MATCHING_PERSONA");
  options.onEvent?.("COMPARING 8 PERSONAS...");
  const personaRanking = scorePersonas(behavior, {
    historyComplete: raw.historyComplete,
    positionPerformance,
    tradeSequences,
  });
  const personaOutcome = resolvePersonaOutcome(personaRanking);
  options.onEvent?.("MATCH LOCKED");
  options.onProgress?.("PACKING_RESULT");
  options.onEvent?.("PACKING YOUR CARD...");
  const qualifyingSignatures = new Set(
    reconstructed.qualifyingSwaps.map((transaction) => transaction.signature),
  );
  const qualifyingValuations = valued.valuations.filter((valuation) =>
    qualifyingSignatures.has(valuation.signature)
  );
  const valuedSwapCount = qualifyingValuations.filter((valuation) => valuation.usdValue !== null).length;
  const sourceCounts = Object.fromEntries(
    VALUATION_SOURCES.map((source) => [
      source,
      qualifyingValuations.filter((valuation) => valuation.source === source).length,
    ]),
  ) as SwapValuationSourceDistribution;
  const timestamps = transactions.map((transaction) => transaction.timestamp);
  const coverage = pricingCoverage(holdings);
  const pricedValues = holdings.flatMap((holding) =>
    holding.usdValue === undefined ? [] : [holding.usdValue],
  );
  const walletValueUsd = pricedValues.length > 0
    ? pricedValues.reduce((sum, value) => sum + value, 0)
    : undefined;
  const basePersonaResult = buildPersonaResult({
    outcome: personaOutcome,
    ranking: personaRanking,
    features: behavior.features,
    positionPerformance,
    tradeSequences,
    walletValueUsd,
    topHoldingUsd: holdings.reduce((top, holding) =>
      holding.usdValue !== undefined && holding.usdValue > top ? holding.usdValue : top, 0) || undefined,
    walletPricingCoverage: coverage,
    behavior,
    historyComplete: raw.historyComplete,
  });
  const pricingMateriallyUnavailable = isMaterialHistoricalPricingOutage(
    reconstructed.qualifyingSwapCount,
    valuedSwapCount,
    valued.historicalPricing,
  );
  const personaResult = applyHistoricalPricingAvailability(
    basePersonaResult,
    reconstructed.qualifyingSwapCount,
    valuedSwapCount,
    valued.historicalPricing,
  );

  return {
    address,
    ...(walletValueUsd === undefined ? {} : { walletValueUsd }),
    // Helius does not return a global count. When history is capped this is the
    // number known to exist inside the configured analysis window.
    transactionCount: raw.transactions.length,
    analyzedTransactionCount: transactions.length,
    ...(raw.historyComplete && timestamps.length > 0
      ? { firstActivityAt: Math.min(...timestamps) }
      : {}),
    ...(timestamps.length > 0 ? { lastActivityAt: Math.max(...timestamps) } : {}),
    holdings,
    transactions,
    positionTelemetry: {
      actions: behavior.features.positionActions,
      assetInteraction: behavior.features.assetInteraction,
      episodes: behavior.features.episodeTerminalStates,
    },
    valuationSummary: {
      qualifyingSwapCount: reconstructed.qualifyingSwapCount,
      valuedSwapCount,
      swapValuationCoverage: reconstructed.qualifyingSwapCount > 0
        ? valuedSwapCount / reconstructed.qualifyingSwapCount
        : 0,
      sourceCounts,
      historicalPricing: valued.historicalPricing,
    },
    positionPerformance,
    tradeSequences,
    personaRanking,
    personaOutcome,
    personaResult,
    priceValidation,
    dataQuality: {
      historyComplete: raw.historyComplete,
      pricingCoverage: coverage,
      confidence: confidenceFor(raw.historyComplete, coverage, transactions.length),
      historicalPricingStatus: valued.historicalPricing.status,
      degradedReasons: pricingMateriallyUnavailable
        ? ["HISTORICAL_PRICING_UNAVAILABLE"]
        : [],
    },
  };
}

export async function buildWalletProfile(address: string, options: WalletProfileBuildOptions = {}): Promise<WalletProfile> {
  return resolveWalletProfileWithCache(
    address,
    () => buildUncachedWalletProfile(address, options),
    {
      onCached: (profile) => {
        options.onProgress?.("PACKING_RESULT");
        emitStoredProfileEvents(profile, options);
      },
      onPending: () => options.onProgress?.("FETCHING_TRANSACTIONS"),
      onPendingResolved: (profile) => {
        options.onProgress?.("PACKING_RESULT");
        emitStoredProfileEvents(profile, options);
      },
    },
  );
}

export const WALLET_ANALYSIS_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;
