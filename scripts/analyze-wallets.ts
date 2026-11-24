// Analyze arbitrary wallet addresses with the current (Phase 5B) scoring and
// print one detailed JSON line per wallet. Usage:
//   node --import ./scripts/server-only-validation-loader.mjs --import <tsx> \
//        scripts/analyze-wallets.ts <address> [address...]
// Invalid addresses are reported and skipped; the pipeline itself is the same
// one the API route uses, with no tuning.

import { readFileSync } from "node:fs";
import { buildWalletBehaviorProfile } from "../lib/analysis/behaviorFeatures";
import { normalizeHoldings, normalizeTransactions } from "../lib/analysis/normalizeTransactions";
import { buildPositionPerformance } from "../lib/analysis/positionPerformance";
import { buildPriceCoverageValidation } from "../lib/analysis/priceCoverageValidation";
import { analyzeTradeSequences } from "../lib/analysis/tradeSequences";
import { valueSwaps } from "../lib/analysis/valueSwaps";
import { scorePersonas } from "../lib/persona/personaScoring";
import { fetchHeliusWalletData, MAX_TRANSACTIONS } from "../lib/solana/helius";

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

async function analyze(address: string) {
  const startedAt = Date.now();
  const raw = await fetchHeliusWalletData(address, MAX_TRANSACTIONS);
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
  console.log(JSON.stringify({
    address,
    elapsedMs: Date.now() - startedAt,
    transactionsAnalyzed: valued.transactions.length,
    historyComplete: raw.historyComplete,
    qualifyingSwaps: ranking.qualifyingSwaps,
    requiredQualifyingSwaps: ranking.requiredQualifyingSwaps,
    resultReason: ranking.resultReason,
    behavior: {
      tradedTokenCount: behavior.features.tradedTokenCount,
      completedPositions: behavior.features.completedPositionCount,
      openPositions: behavior.features.openPositionCount,
      reentries: behavior.features.reentryCount,
      observedVolumeUsd: behavior.features.totalVolumeUsd.value,
      volumeCoverage: behavior.features.totalVolumeUsd.coverage,
      realizedPnlUsd: behavior.features.realizedPnlUsd.value,
      pnlCoverage: behavior.features.realizedPnlUsd.coverage,
    },
    personas: ranking.scores.map(({ personaId, match, confidence, eligible }) => ({
      personaId, match, confidence, eligible,
    })),
    winner: ranking.winner
      ? { personaId: ranking.winner.personaId, match: ranking.winner.match, confidence: ranking.winner.confidence }
      : null,
    runnerUp: ranking.runnerUp
      ? { personaId: ranking.runnerUp.personaId, match: ranking.runnerUp.match }
      : null,
    winnerMargin: ranking.winner && ranking.runnerUp
      ? (ranking.winner.match ?? 0) - (ranking.runnerUp.match ?? 0)
      : null,
    icarusCandidates: priceValidation.icarusCandidates,
    midasCandidates: priceValidation.midasCandidates,
    donQuixoteCandidates: priceValidation.donQuixoteCandidates,
    historical: priceValidation.historical,
    current: priceValidation.current,
    cost: {
      externalRequests: positionPerformance.costReport.externalRequests,
      providerFailures: positionPerformance.costReport.providerFailures,
      cacheHits: positionPerformance.costReport.cacheHits,
      unsupportedMints: positionPerformance.costReport.unsupportedTokens,
      requestLimitReached: positionPerformance.costReport.requestLimitReached,
    },
  }));
}

loadLocalEnvironment();
const addresses = process.argv.slice(2);
if (addresses.length === 0) {
  console.error("usage: analyze-wallets.ts <address> [address...]");
  process.exit(1);
}
for (const [index, address] of addresses.entries()) {
  if (!isValidSolanaPublicKey(address)) {
    console.log(JSON.stringify({ address, error: "INVALID_ADDRESS" }));
    continue;
  }
  try {
    await analyze(address);
  } catch (error) {
    console.log(JSON.stringify({
      address,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  if (index < addresses.length - 1) await new Promise((resolve) => setTimeout(resolve, 3_000));
}
