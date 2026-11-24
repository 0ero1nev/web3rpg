// Phase 8 — analysis latency profiler. Measurement only: the pipeline modules
// are called exactly as the API route calls them; the only additions are
// wall-clock timers around each stage, injected wrappers around the SOL-price
// loader and token-price resolver (both existing injection points), and a
// global fetch wrapper that records every outbound request (provider, purpose,
// duration, outcome — never query strings or headers, so no keys leak).
//
// Usage: profile-analysis.ts <address> <label> <mode cold|warm> [outJson]
// Runs the full analysis ONCE and prints one JSON object.

import { readFileSync, writeFileSync } from "node:fs";
import { buildWalletBehaviorProfile } from "../lib/analysis/behaviorFeatures";
import { normalizeHoldings, normalizeTransactions } from "../lib/analysis/normalizeTransactions";
import { reconstructPositions } from "../lib/analysis/reconstructPositions";
import { buildPositionPerformance } from "../lib/analysis/positionPerformance";
import { buildPriceCoverageValidation } from "../lib/analysis/priceCoverageValidation";
import { analyzeTradeSequences } from "../lib/analysis/tradeSequences";
import { valueSwaps } from "../lib/analysis/valueSwaps";
import { scorePersonas, resolvePersonaOutcome } from "../lib/persona/personaScoring";
import { buildPersonaResult } from "../lib/persona/personaResult";
import { fetchHeliusWalletData, MAX_TRANSACTIONS } from "../lib/solana/helius";
import { getHistoricalPricesUsd, type HistoricalPricePoint } from "../lib/pricing/historicalPrice";
import { getTokenHistoricalPricesUsd, type TokenHistoricalPriceBudget, type TokenHistoricalPriceResult } from "../lib/pricing/tokenHistoricalPrice";

function loadLocalEnvironment() {
  const source = readFileSyncText(new URL("../.env.local", import.meta.url));
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[name] = value;
  }
}
function readFileSyncText(url: URL) {
  return readFileSync(url, "utf8");
}

type RequestRecord = {
  provider: string;
  purpose: string;
  durationMs: number;
  status: number | string;
  success: boolean;
};

const requests: RequestRecord[] = [];

function installFetchWrapper() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const started = Date.now();
    let provider = "other";
    let purpose = "other";
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      // Never log search params (they can carry keys); classify by path only.
      const path = url.pathname;
      if (url.host === "api.helius.xyz") {
        provider = "helius";
        purpose = path.includes("/balances") ? "balances" : path.includes("/history") ? "history-page" : path.includes("/transactions") ? "parsed-transactions" : "other";
      } else if (url.host.endsWith("coingecko.com")) {
        provider = "coingecko";
        purpose = path.includes("/contract/") ? "token-range" : path.includes("/coins/solana/") ? "sol-range" : "other";
      } else if (url.host === "api.exchange.coinbase.com") {
        provider = "coinbase";
        purpose = "sol-range";
      }
    } catch { /* classification failure keeps defaults */ }
    try {
      const response = await realFetch(input, init);
      requests.push({ provider, purpose, durationMs: Date.now() - started, status: response.status, success: response.status < 400 });
      return response;
    } catch (error) {
      requests.push({ provider, purpose, durationMs: Date.now() - started, status: error instanceof Error ? error.name : "error", success: false });
      throw error;
    }
  }) as typeof fetch;
}

function purposeOf(record: RequestRecord) {
  return `${record.provider}:${record.purpose}`;
}

async function main() {
  const [address, label, mode, outPath] = process.argv.slice(2);
  if (!address || !label || !mode) throw new Error("usage: profile-analysis.ts <address> <label> <cold|warm> [outJson]");
  installFetchWrapper();
  const timings: Record<string, number> = {};
  const counters: Record<string, number> = { solBucketRequests: 0 };

  const totalStart = Date.now();
  let t = Date.now();
  const raw = await fetchHeliusWalletData(address, MAX_TRANSACTIONS);
  timings.TRANSACTION_FETCH = Date.now() - t;

  t = Date.now();
  const holdings = normalizeHoldings(raw.balances);
  const normalized = normalizeTransactions(raw.transactions, holdings);
  timings.TRANSACTION_NORMALIZATION = Date.now() - t;

  // SOL pricing rides inside valueSwaps via the loadSolPrices injection point.
  let solPricingMs = 0;
  let solBuckets = 0;
  t = Date.now();
  const valued = await valueSwaps(normalized, {
    loadSolPrices: async (timestamps: number[]) => {
      solBuckets += timestamps.length;
      const innerStart = Date.now();
      const result = await getHistoricalPricesUsd("SOL", timestamps);
      solPricingMs += Date.now() - innerStart;
      return result as Map<number, HistoricalPricePoint | null>;
    },
  });
  timings.EXECUTION_VALUATION = Date.now() - t - solPricingMs;
  timings.HISTORICAL_SOL_PRICING = solPricingMs;
  counters.solBucketRequests = solBuckets;

  t = Date.now();
  reconstructPositions(valued.transactions, { historyComplete: raw.historyComplete });
  timings.POSITION_RECONSTRUCTION = Date.now() - t;

  t = Date.now();
  const behavior = buildWalletBehaviorProfile(valued.transactions, { historyComplete: raw.historyComplete });
  timings.BEHAVIOR_FEATURES = Math.max(0, Date.now() - t - timings.POSITION_RECONSTRUCTION);

  let tokenPricingMs = 0;
  let tokenRequests = 0;
  let tokenCacheHits = 0;
  t = Date.now();
  const positionPerformance = await buildPositionPerformance(behavior, holdings, {
    historyComplete: raw.historyComplete,
    priceResolver: async (mint: string, timestamps: number[], options: { budget: TokenHistoricalPriceBudget }) => {
      const innerStart = Date.now();
      const result = await getTokenHistoricalPricesUsd(mint, timestamps, options as Parameters<typeof getTokenHistoricalPricesUsd>[2]);
      tokenPricingMs += Date.now() - innerStart;
      tokenRequests += result.stats.externalRequests;
      tokenCacheHits += result.stats.cacheHits;
      return result as TokenHistoricalPriceResult;
    },
  });
  const positionTotal = Date.now() - t;
  timings.HISTORICAL_TOKEN_PRICING = tokenPricingMs;

  t = Date.now();
  const tradeSequences = analyzeTradeSequences(positionPerformance);
  const ranking = scorePersonas(behavior, {
    historyComplete: raw.historyComplete,
    positionPerformance,
    tradeSequences,
  });
  timings.PERSONA_SCORING = Date.now() - t;

  t = Date.now();
  const outcome = resolvePersonaOutcome(ranking);
  const result = buildPersonaResult({
    outcome,
    ranking,
    features: behavior.features,
    positionPerformance,
    tradeSequences,
    walletValueUsd: holdings.reduce((sum, holding) => sum + (holding.usdValue ?? 0), 0) || undefined,
    topHoldingUsd: holdings.reduce((top, holding) => Math.max(top, holding.usdValue ?? 0), 0) || undefined,
    behavior,
    historyComplete: raw.historyComplete,
  });
  timings.RESULT_BUILDING = Date.now() - t;
  timings.POSITION_EPISODE_MATH = Math.max(0, positionTotal - tokenPricingMs);

  timings.TOTAL_ANALYSIS = Date.now() - totalStart;
  const coldRequests = requests.slice();
  const coldCounters = {
    transactionCount: raw.transactions.length,
    qualifyingSwapCount: behavior.features.qualifyingSwapCount,
    externalRequestCount: coldRequests.length,
    solPriceRequestCount: coldRequests.filter((record) => record.purpose === "sol-range").length,
    tokenPriceRequestCount: coldRequests.filter((record) => record.purpose === "token-range").length,
    heliusRequestCount: coldRequests.filter((record) => record.provider === "helius").length,
    tokenCacheHits,
    solBucketRequests: solBuckets,
  };

  // True warm path: the production entry point owns a 10-minute profile cache.
  // Fill it once (untimed), then measure a warm run for total time + requests.
  const { buildWalletProfile } = await import("../lib/analysis/buildWalletProfile");
  requests.length = 0;
  await buildWalletProfile(address);
  requests.length = 0;
  const warmStart = Date.now();
  const warmProfile = await buildWalletProfile(address);
  const warmTotalMs = Date.now() - warmStart;
  const warmRequests = requests.slice();

  const profile = {
    label,
    mode,
    address,
    timings,
    counters: coldCounters,
    resultKind: result.kind,
    personaSnapshot: {
      qualifyingSwapCount: behavior.features.qualifyingSwapCount,
      personas: Object.fromEntries(ranking.scores.map((score) => [score.personaId, { match: score.match, eligible: score.eligible }])),
      winner: ranking.winner ? { personaId: ranking.winner.personaId, match: ranking.winner.match, confidence: ranking.winner.confidence } : null,
    },
    warm: {
      totalMs: warmTotalMs,
      requestCount: warmRequests.length,
      resultKind: warmProfile.personaResult?.kind ?? null,
    },
    requests: coldRequests,
  };
  const line = JSON.stringify(profile);
  if (outPath) writeFileSync(outPath, `${line}\n`);
  console.log(line);
}

loadLocalEnvironment();
await main();
