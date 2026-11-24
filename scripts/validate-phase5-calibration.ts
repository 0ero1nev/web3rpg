// Phase 5 — Persona calibration dataset driver.
//
// Three read-only subcommands over the UNCHANGED production pipeline:
//   harvest — collect active trading wallets from recent on-chain activity of
//             mints already observed in Phase 2–4 validation, then store them
//             in data/persona-calibration/dataset.json (addresses live here,
//             never inside scoring code).
//   run     — for every dataset wallet, run parser -> valuation -> behavior ->
//             position performance -> trade sequences -> persona scoring with
//             no tuning, appending one JSON line per wallet to
//             raw-results.jsonl (resume-safe). Counts outbound provider
//             requests by wrapping global fetch; no lib code is touched.
//   report  — aggregate raw-results.jsonl into raw-results.json, summary.json
//             and phase5-calibration.md.
//
// No Persona formula, threshold, eligibility rule, parser behavior, valuation
// rule, or UI is modified by this script.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildWalletBehaviorProfile } from "../lib/analysis/behaviorFeatures";
import { normalizeHoldings, normalizeTransactions } from "../lib/analysis/normalizeTransactions";
import { buildPositionPerformance } from "../lib/analysis/positionPerformance";
import { buildPriceCoverageValidation } from "../lib/analysis/priceCoverageValidation";
import { analyzeTradeSequences } from "../lib/analysis/tradeSequences";
import { valueSwaps } from "../lib/analysis/valueSwaps";
import { scorePersonas } from "../lib/persona/personaScoring";
import { fetchHeliusWalletData, MAX_TRANSACTIONS } from "../lib/solana/helius";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");
const DATASET_PATH = join(OUTPUT_DIR, "dataset.json");
const RESULTS_PATH = join(OUTPUT_DIR, "raw-results.jsonl");
const WALLET_PAUSE_MS = 10_000;
const FRESH_TARGET = 40;
const PER_SOURCE_CAP = 8;

// Seed wallets from Phase 2–4 validation; also the mints whose recent trader
// activity seeds the harvested half of the dataset. All mints below were
// actually observed in these wallets' histories during prior validation.
const SEED_WALLETS = [
  ["A", "686C4R7PgGipaCYXkngNRpZKEDVPRjGpFTaafucYeUyL"],
  ["B", "5V676H2Th83MycbJQ1JuL3f8GCCf6WDDVY2qY8Tj9zFb"],
  ["C", "9yuZqpCqtbyr2RkYYzKVooPy1DWUqakumeFQncE9mJh1"],
  ["D", "2dAPqfwfhVXKzFxq9sVAQcKTg1vsopkJVyXnR2XqcDCu"],
] as const;
const HARVEST_SOURCES = [
  ["pump-c", "6ehEcTMCc85aNF4x9CWx8HuvWGhxQtvKdhKVf2HDpump"],
  ["pump-a", "98kfF7rmsg1QDUEoCqNE7g7M1FdrTt92TEp2CLzypump"],
  ["pump-b", "Hg5Ja55T5wESq4vyFoiVCMeHXtGyVA69X2UHq8hgpump"],
  ["meta-d", "BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta"],
  ["jup", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"],
  ["pump-major", "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn"],
] as const;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function isValidSolanaPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 44) return false;
  let number = BigInt(0);
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    number = number * BigInt(58) + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > BigInt(0)) {
    bytes.push(Number(number % BigInt(256)));
    number /= BigInt(256);
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.push(0);
  }
  return bytes.length === 32;
}

function loadLocalEnvironment() {
  const source = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

function providerBuckets() {
  const realFetch = globalThis.fetch;
  const counts = { helius: 0, coingecko: 0, coinbase: 0, other: 0 };
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      const host = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).host;
      if (host === "api.helius.xyz") counts.helius += 1;
      else if (host.endsWith("coingecko.com")) counts.coingecko += 1;
      else if (host === "api.exchange.coinbase.com") counts.coinbase += 1;
      else counts.other += 1;
    } catch {
      counts.other += 1;
    }
    return realFetch(input, init);
  }) as typeof fetch;
  return counts;
}

type DatasetEntry = { label: string; address: string; source: string; addedAt: string };

async function harvest() {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error("HELIUS_API_KEY is required for harvest.");
  const excluded = new Set<string>([
    ...SEED_WALLETS.map(([, address]) => address),
    ...HARVEST_SOURCES.map(([, mint]) => mint),
  ]);
  const bySource = new Map<string, string[]>();
  for (const [sourceName, mint] of HARVEST_SOURCES) {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${mint}/transactions`);
    url.searchParams.set("limit", "100");
    const response = await fetch(url, { headers: { "X-Api-Key": apiKey }, cache: "no-store" });
    if (!response.ok) throw new Error(`Harvest source ${sourceName} failed: HTTP ${response.status}`);
    const transactions = await response.json() as Array<Record<string, unknown>>;
    const wallets = new Set<string>();
    for (const transaction of transactions) {
      const candidates = [
        transaction.feePayer,
        ...(Array.isArray(transaction.tokenBalances)
          ? (transaction.tokenBalances as Array<Record<string, unknown>>).map((balance) => balance.owner)
          : []),
      ];
      for (const candidate of candidates) {
        if (isValidSolanaPublicKey(candidate) && !excluded.has(candidate)) wallets.add(candidate);
      }
    }
    bySource.set(sourceName, [...wallets]);
    console.log(`[harvest] ${sourceName}: ${transactions.length} txs -> ${wallets.size} unique wallets`);
  }
  // Round-robin across sources so no single token's crowd dominates the set.
  const entries: DatasetEntry[] = SEED_WALLETS.map(([label, address]) => ({
    label, address, source: "seed", addedAt: new Date().toISOString(),
  }));
  const seen = new Set(entries.map((entry) => entry.address));
  const queues = HARVEST_SOURCES.map(([sourceName]) => ({
    name: sourceName,
    pool: bySource.get(sourceName) ?? [],
    cursor: 0,
  }));
  while (entries.length < SEED_WALLETS.length + FRESH_TARGET) {
    let advanced = false;
    for (const queue of queues) {
      if (entries.length >= SEED_WALLETS.length + FRESH_TARGET) break;
      if (queue.cursor >= Math.min(queue.pool.length, PER_SOURCE_CAP)) continue;
      const address = queue.pool[queue.cursor];
      queue.cursor += 1;
      advanced = true;
      if (seen.has(address)) continue;
      seen.add(address);
      entries.push({
        label: `W${String(entries.length - SEED_WALLETS.length + 1).padStart(2, "0")}`,
        address,
        source: queue.name,
        addedAt: new Date().toISOString(),
      });
    }
    if (!advanced) break;
  }
  writeFileSync(DATASET_PATH, `${JSON.stringify({ harvestedAt: new Date().toISOString(), entries }, null, 2)}\n`);
  console.log(`[harvest] dataset written: ${entries.length} wallets -> ${DATASET_PATH}`);
}

type ProviderCounts = { helius: number; coingecko: number; coinbase: number; other: number };

async function analyzeWallet(entry: DatasetEntry, outbound: ProviderCounts) {
  const startedAt = Date.now();
  const before = { ...outbound };
  const raw = await fetchHeliusWalletData(entry.address, MAX_TRANSACTIONS);
  const holdings = normalizeHoldings(raw.balances);
  const normalized = normalizeTransactions(raw.transactions, holdings);
  const valued = await valueSwaps(normalized);
  const behavior = buildWalletBehaviorProfile(valued.transactions, { historyComplete: raw.historyComplete });
  const positionPerformance = await buildPositionPerformance(behavior, holdings, {
    historyComplete: raw.historyComplete,
  });
  const tradeSequences = analyzeTradeSequences(positionPerformance);
  const ranking = scorePersonas(behavior, {
    historyComplete: raw.historyComplete,
    positionPerformance,
    tradeSequences,
  });
  const priceValidation = buildPriceCoverageValidation(positionPerformance);
  const winner = ranking.winner;
  const runnerUp = ranking.runnerUp;
  return {
    label: entry.label,
    address: entry.address,
    source: entry.source,
    elapsedMs: Date.now() - startedAt,
    historyComplete: raw.historyComplete,
    transactionsAnalyzed: valued.transactions.length,
    qualifyingSwaps: behavior.features.qualifyingSwapCount,
    tradedTokenCount: behavior.features.tradedTokenCount,
    completedPositions: behavior.features.completedPositionCount,
    openPositions: behavior.features.openPositionCount,
    reentries: behavior.features.reentryCount,
    observedVolumeUsd: behavior.features.totalVolumeUsd.value,
    volumeCoverage: behavior.features.totalVolumeUsd.coverage,
    realizedPnlUsd: behavior.features.realizedPnlUsd.value,
    pnlCoverage: behavior.features.realizedPnlUsd.coverage,
    historicalPriceCoverage: priceValidation.historical.historicalPriceCoverage,
    currentPriceCoverage: priceValidation.current.currentPriceCoverage,
    personas: Object.fromEntries(ranking.scores.map((score) => [
      score.personaId,
      { match: score.match, confidence: score.confidence, eligible: score.eligible },
    ])),
    winner: winner ? { personaId: winner.personaId, match: winner.match, confidence: winner.confidence } : null,
    runnerUp: runnerUp ? { personaId: runnerUp.personaId, match: runnerUp.match, confidence: runnerUp.confidence } : null,
    winnerMargin: winner && runnerUp ? (winner.match ?? 0) - (runnerUp.match ?? 0) : null,
    icarus: {
      eligibleEpisodes: priceValidation.historical.historicalPriceEligibleEpisodes,
      pricedEpisodes: priceValidation.historical.historicalPricePricedEpisodes,
      externalRequests: priceValidation.historical.externalRequests,
      providerFailures: priceValidation.historical.providerFailures,
      unsupportedMints: priceValidation.historical.unsupportedTokens,
      requestLimitReached: priceValidation.historical.requestLimitReached,
      candidates: priceValidation.icarusCandidates,
    },
    cost: {
      externalRequests: positionPerformance.costReport.externalRequests,
      cacheHits: positionPerformance.costReport.cacheHits,
      providerFailures: positionPerformance.costReport.providerFailures,
      unsupportedMints: positionPerformance.costReport.unsupportedTokens,
      requestLimitReached: positionPerformance.costReport.requestLimitReached,
      positionsAvailable: positionPerformance.costReport.positionsAvailable,
      positionsConsidered: positionPerformance.costReport.positionsConsidered,
    },
    outbound: {
      helius: outbound.helius - before.helius,
      coingecko: outbound.coingecko - before.coingecko,
      coinbase: outbound.coinbase - before.coinbase,
      other: outbound.other - before.other,
    },
  };
}

async function run() {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as { entries: DatasetEntry[] };
  const done = new Set<string>(
    existsSync(RESULTS_PATH)
      ? readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
        try { return (JSON.parse(line) as { address: string }).address; } catch { return ""; }
      }).filter(Boolean)
      : [],
  );
  const outbound = providerBuckets();
  let index = 0;
  for (const entry of dataset.entries) {
    index += 1;
    if (done.has(entry.address)) {
      console.log(`[run ${index}/${dataset.entries.length}] ${entry.label} already done, skipping`);
      continue;
    }
    console.log(`[run ${index}/${dataset.entries.length}] ${entry.label} (${entry.source}) starting`);
    try {
      const result = await analyzeWallet(entry, outbound);
      appendFileSync(RESULTS_PATH, `${JSON.stringify(result)}\n`);
      console.log(`[run] ${entry.label} done in ${(result.elapsedMs / 1000).toFixed(1)}s `
        + `winner=${result.winner ? `${result.winner.personaId}@${result.winner.match}` : "NONE"} `
        + `margin=${result.winnerMargin ?? "-"} txs=${result.transactionsAnalyzed}`);
    } catch (error) {
      const failure = {
        label: entry.label, address: entry.address, source: entry.source,
        error: error instanceof Error ? error.message : String(error),
        outbound: { helius: 0, coingecko: 0, coinbase: 0, other: 0 },
      };
      appendFileSync(RESULTS_PATH, `${JSON.stringify(failure)}\n`);
      console.log(`[run] ${entry.label} FAILED: ${failure.error}`);
    }
    if (index < dataset.entries.length) await new Promise((resolve) => setTimeout(resolve, WALLET_PAUSE_MS));
  }
  console.log(`[run] complete. outbound totals: ${JSON.stringify(outbound)}`);
}

loadLocalEnvironment();
const command = process.argv[2];
if (command === "harvest") {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  await harvest();
} else if (command === "run") {
  await run();
} else if (command === "report") {
  const { buildReport } = await import("./phase5-report");
  await buildReport();
} else {
  console.error("usage: validate-phase5-calibration.ts harvest|run|report");
  process.exit(1);
}
