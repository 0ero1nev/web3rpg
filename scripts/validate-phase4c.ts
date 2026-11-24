import { readFileSync } from "node:fs";
import { buildWalletBehaviorProfile } from "../lib/analysis/behaviorFeatures";
import { normalizeHoldings, normalizeTransactions } from "../lib/analysis/normalizeTransactions";
import { buildPositionPerformance } from "../lib/analysis/positionPerformance";
import { buildPriceCoverageValidation } from "../lib/analysis/priceCoverageValidation";
import { analyzeTradeSequences } from "../lib/analysis/tradeSequences";
import { valueSwaps } from "../lib/analysis/valueSwaps";
import { scorePersonas } from "../lib/persona/personaScoring";
import { fetchHeliusWalletData, MAX_TRANSACTIONS } from "../lib/solana/helius";

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

async function analyzeWallet(label: string, address: string) {
  const startedAt = Date.now();
  const raw = await fetchHeliusWalletData(address, MAX_TRANSACTIONS);
  const holdings = normalizeHoldings(raw.balances);
  const normalized = normalizeTransactions(raw.transactions, holdings);
  const valued = await valueSwaps(normalized);
  const behavior = buildWalletBehaviorProfile(valued.transactions, {
    historyComplete: raw.historyComplete,
  });
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
    label,
    address,
    elapsedMs: Date.now() - startedAt,
    transactionsAnalyzed: valued.transactions.length,
    historyComplete: raw.historyComplete,
    scores: ranking.scores.map(({ personaId, match, confidence, eligible }) => ({
      personaId, match, confidence, eligible,
    })),
    winner: ranking.winner
      ? { personaId: ranking.winner.personaId, match: ranking.winner.match, confidence: ranking.winner.confidence }
      : null,
    historical: priceValidation.historical,
    current: priceValidation.current,
    midasCandidates: priceValidation.midasCandidates,
    donQuixoteCandidates: priceValidation.donQuixoteCandidates,
    icarusCandidates: priceValidation.icarusCandidates,
    cost: positionPerformance.costReport,
  }));
}

loadLocalEnvironment();
const fixtures = [
  ["A", "686C4R7PgGipaCYXkngNRpZKEDVPRjGpFTaafucYeUyL"],
  ["B", "5V676H2Th83MycbJQ1JuL3f8GCCf6WDDVY2qY8Tj9zFb"],
  ["C", "9yuZqpCqtbyr2RkYYzKVooPy1DWUqakumeFQncE9mJh1"],
  ["D", "2dAPqfwfhVXKzFxq9sVAQcKTg1vsopkJVyXnR2XqcDCu"],
] as const;
const [requestedLabel, requestedAddress] = process.argv.slice(2);
const selected = requestedLabel && requestedAddress
  ? [[requestedLabel, requestedAddress] as const]
  : fixtures;
for (const [label, address] of selected) {
  await analyzeWallet(label, address);
}
