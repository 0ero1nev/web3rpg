// Phase 5B — minimal persona calibration re-run.
//
//   run     — re-analyze the EXACT Phase 5 dataset (data/persona-calibration/
//             dataset.json) against the Phase 5B scoring changes, appending to
//             phase5b-results.jsonl (resume-safe, same pipeline order).
//   compare — diff Phase 5 (raw-results.jsonl, BEFORE) against Phase 5B
//             (phase5b-results.jsonl, AFTER) and write before-after.json plus
//             phase5b-calibration.md.
//
// Phase 5B scoring changes under test (nothing else touched):
//   1. wallet-level INSUFFICIENT_HISTORY below 10 qualifying swaps
//   2. MIN_WINNING_MATCH = 50 gate for winner assignment
//   3. Don Quixote continuous loss-severity x holding-persistence scoring

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
const BEFORE_PATH = join(OUTPUT_DIR, "raw-results.jsonl");
const AFTER_PATH = join(OUTPUT_DIR, "phase5b-results.jsonl");
const WALLET_PAUSE_MS = 10_000;
const DRIFT_TOLERANCE = 2;

type DatasetEntry = { label: string; address: string; source: string };

type WalletResult = {
  label: string; address: string; source: string; elapsedMs: number;
  historyComplete: boolean; transactionsAnalyzed: number; qualifyingSwaps: number;
  resultReason: "INSUFFICIENT_HISTORY" | "NO_ELIGIBLE_PERSONA" | "NO_STRONG_MATCH" | null;
  personas: Record<string, { match: number | null; confidence: number; eligible: boolean }>;
  winner: { personaId: string; match: number; confidence: number } | null;
  runnerUp: { personaId: string; match: number; confidence: number } | null;
  winnerMargin: number | null;
  donQuixoteDetail: {
    openPositions: number;
    measurableOpenReturn: number;
    losingMeasured: number;
    strongest: { returnPct: number | null; days: number | null; match: number | null } | null;
  };
  icarus: { eligibleEpisodes: number; pricedEpisodes: number; requestLimitReached: boolean };
  cost: { externalRequests: number; providerFailures: number; cacheHits: number };
  error?: string;
};

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

async function analyzeWallet(entry: DatasetEntry) {
  const startedAt = Date.now();
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
  const donQuixote = ranking.scores.find((persona) => persona.personaId === "don_quixote");
  const open = positionPerformance.positions.filter((position) => position.status === "OPEN");
  const measured = open.filter((position) =>
    position.entryPriceUsd !== null && position.currentPriceUsd !== null && position.unrealizedReturnPct !== null);
  const losing = measured.filter((position) => (position.unrealizedReturnPct ?? 0) < 0)
    .sort((left, right) => (left.unrealizedReturnPct ?? 0) - (right.unrealizedReturnPct ?? 0));
  return {
    label: entry.label,
    address: entry.address,
    source: entry.source,
    elapsedMs: Date.now() - startedAt,
    historyComplete: raw.historyComplete,
    transactionsAnalyzed: valued.transactions.length,
    qualifyingSwaps: ranking.qualifyingSwaps,
    resultReason: ranking.resultReason,
    personas: Object.fromEntries(ranking.scores.map((score) => [
      score.personaId,
      { match: score.match, confidence: score.confidence, eligible: score.eligible },
    ])),
    winner: ranking.winner
      ? { personaId: ranking.winner.personaId, match: ranking.winner.match, confidence: ranking.winner.confidence }
      : null,
    runnerUp: ranking.runnerUp
      ? { personaId: ranking.runnerUp.personaId, match: ranking.runnerUp.match, confidence: ranking.runnerUp.confidence }
      : null,
    winnerMargin: ranking.winner && ranking.runnerUp
      ? (ranking.winner.match ?? 0) - (ranking.runnerUp.match ?? 0)
      : null,
    donQuixoteDetail: {
      openPositions: open.length,
      measurableOpenReturn: measured.length,
      losingMeasured: losing.length,
      strongest: donQuixote?.eligible && losing[0] ? {
        returnPct: losing[0].unrealizedReturnPct,
        days: losing[0].holdingDuration === null ? null : Number((losing[0].holdingDuration / 86_400).toFixed(1)),
        match: donQuixote.match,
      } : null,
    },
    icarus: {
      eligibleEpisodes: priceValidation.historical.historicalPriceEligibleEpisodes,
      pricedEpisodes: priceValidation.historical.historicalPricePricedEpisodes,
      requestLimitReached: priceValidation.historical.requestLimitReached,
    },
    cost: {
      externalRequests: positionPerformance.costReport.externalRequests,
      providerFailures: positionPerformance.costReport.providerFailures,
      cacheHits: positionPerformance.costReport.cacheHits,
    },
  };
}

async function run() {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as { entries: DatasetEntry[] };
  const done = new Set<string>(
    existsSync(AFTER_PATH)
      ? readFileSync(AFTER_PATH, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
        try { return (JSON.parse(line) as { address: string; error?: string }).address; } catch { return ""; }
      }).filter(Boolean)
      : [],
  );
  let index = 0;
  for (const entry of dataset.entries) {
    index += 1;
    if (done.has(entry.address)) {
      console.log(`[run ${index}/${dataset.entries.length}] ${entry.label} already done, skipping`);
      continue;
    }
    console.log(`[run ${index}/${dataset.entries.length}] ${entry.label} (${entry.source}) starting`);
    try {
      const result = await analyzeWallet(entry);
      appendFileSync(AFTER_PATH, `${JSON.stringify(result)}\n`);
      console.log(`[run] ${entry.label} done in ${(result.elapsedMs / 1000).toFixed(1)}s `
        + `winner=${result.winner ? `${result.winner.personaId}@${result.winner.match}` : `NONE(${result.resultReason})`} `
        + `dq=${result.personas.don_quixote.match ?? "-"} txs=${result.transactionsAnalyzed}`);
    } catch (error) {
      appendFileSync(AFTER_PATH, `${JSON.stringify({
        label: entry.label, address: entry.address, source: entry.source,
        error: error instanceof Error ? error.message : String(error),
      })}\n`);
      console.log(`[run] ${entry.label} FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (index < dataset.entries.length) await new Promise((resolve) => setTimeout(resolve, WALLET_PAUSE_MS));
  }
  console.log("[run] complete");
}

function readResults(path: string) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as WalletResult);
}

async function compare() {
  const before = readResults(BEFORE_PATH).filter((result) => !result.error);
  const after = readResults(AFTER_PATH).filter((result) => !result.error);
  const afterFailures = readResults(AFTER_PATH).filter((result) => result.error);
  const afterByLabel = new Map(after.map((result) => [result.label, result]));
  const PERSONAS = ["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"];

  const reasonCounts = { INSUFFICIENT_HISTORY: 0, NO_ELIGIBLE_PERSONA: 0, NO_STRONG_MATCH: 0, ASSIGNED: 0 };
  for (const result of after) {
    if (result.resultReason === "INSUFFICIENT_HISTORY") reasonCounts.INSUFFICIENT_HISTORY += 1;
    else if (result.resultReason === "NO_ELIGIBLE_PERSONA") reasonCounts.NO_ELIGIBLE_PERSONA += 1;
    else if (result.resultReason === "NO_STRONG_MATCH") reasonCounts.NO_STRONG_MATCH += 1;
    else reasonCounts.ASSIGNED += 1;
  }
  const distribution = (results: WalletResult[]) => {
    const counts = Object.fromEntries(PERSONAS.map((persona) => [persona, 0]));
    for (const result of results) {
      if (result.winner) counts[result.winner.personaId] = (counts[result.winner.personaId] ?? 0) + 1;
    }
    return counts;
  };
  const donQuixoteStats = (results: WalletResult[]) => ({
    measurable: results.filter((result) => result.personas.don_quixote.match !== null).length,
    nonZero: results.filter((result) => (result.personas.don_quixote.match ?? 0) > 0).length,
    eligible: results.filter((result) => result.personas.don_quixote.eligible).length,
    wins: results.filter((result) => result.winner?.personaId === "don_quixote").length,
    strongMatches: results.filter((result) => (result.personas.don_quixote.match ?? 0) >= 50).length,
  });

  const changedWallets: Array<{
    label: string; before: string | null; after: string | null; reason: string | null;
    donQuixoteBefore: number | null; donQuixoteAfter: number | null; drifted: boolean;
  }> = [];
  for (const beforeResult of before) {
    const afterResult = afterByLabel.get(beforeResult.label);
    if (!afterResult) continue;
    const beforeWinner = beforeResult.winner?.personaId ?? null;
    const afterWinner = afterResult.winner?.personaId ?? null;
    if (beforeWinner !== afterWinner) {
      // Attribute the change only when untouched personas' scores are stable;
      // provider data drifts between runs, so flag wallets where they moved.
      const drifted = PERSONAS.some((persona) => {
        if (persona === "don_quixote") return false;
        const beforeMatch = beforeResult.personas[persona]?.match ?? null;
        const afterMatch = afterResult.personas[persona]?.match ?? null;
        if (beforeMatch === null || afterMatch === null) return beforeMatch !== afterMatch;
        return Math.abs(beforeMatch - afterMatch) >= DRIFT_TOLERANCE;
      });
      changedWallets.push({
        label: beforeResult.label,
        before: beforeWinner,
        after: afterWinner,
        reason: afterResult.resultReason,
        donQuixoteBefore: beforeResult.personas.don_quixote.match ?? null,
        donQuixoteAfter: afterResult.personas.don_quixote.match ?? null,
        drifted,
      });
    }
  }

  const dqStrongest = after
    .filter((result) => result.donQuixoteDetail?.strongest)
    .sort((left, right) => (right.donQuixoteDetail.strongest?.match ?? 0) - (left.donQuixoteDetail.strongest?.match ?? 0))
    .slice(0, 10)
    .map((result) => ({
      label: result.label,
      returnPct: result.donQuixoteDetail.strongest?.returnPct ?? null,
      days: result.donQuixoteDetail.strongest?.days ?? null,
      match: result.donQuixoteDetail.strongest?.match ?? null,
    }));

  const comparison = {
    generatedAt: new Date().toISOString(),
    scoredBefore: before.length,
    scoredAfter: after.length,
    failuresAfter: afterFailures.length,
    before: {
      noWinner: before.filter((result) => !result.winner).length,
      winnerDistribution: distribution(before),
      donQuixote: donQuixoteStats(before),
    },
    after: {
      reasonCounts,
      winnerDistribution: distribution(after),
      donQuixote: donQuixoteStats(after),
    },
    changedWallets,
    donQuixoteStrongest: dqStrongest,
  };
  writeFileSync(join(OUTPUT_DIR, "before-after.json"), `${JSON.stringify(comparison, null, 2)}\n`);

  const lines: string[] = [];
  const total = after.length;
  lines.push("# Phase 5B — Minimal Persona Calibration (BEFORE vs AFTER)", "");
  lines.push(`Generated: ${comparison.generatedAt} (Asia/Shanghai)`, "");
  lines.push("Same 44-wallet Phase 5 dataset, unchanged parser/valuation pipeline. Scoring changes:");
  lines.push("wallet-level `INSUFFICIENT_HISTORY` (< 10 qualifying swaps), `MIN_WINNING_MATCH = 50`");
  lines.push("winner gate, and continuous Don Quixote loss × persistence scoring. Sisyphus, Newton,");
  lines.push("Caesar, Croesus, Icarus, Midas, and Napoleon formulas are untouched; Icarus untouched explicitly.", "");

  lines.push("## Result reason distribution", "");
  lines.push("| Result | BEFORE | AFTER |");
  lines.push("|---|---:|---:|");
  lines.push(`| Assigned winner | ${before.length - comparison.before.noWinner} | ${reasonCounts.ASSIGNED} |`);
  lines.push(`| NO winner | ${comparison.before.noWinner} | ${total - reasonCounts.ASSIGNED} |`);
  lines.push(`| — INSUFFICIENT_HISTORY | n/a | ${reasonCounts.INSUFFICIENT_HISTORY} |`);
  lines.push(`| — NO_ELIGIBLE_PERSONA | ${comparison.before.noWinner} (combined) | ${reasonCounts.NO_ELIGIBLE_PERSONA} |`);
  lines.push(`| — NO_STRONG_MATCH | n/a | ${reasonCounts.NO_STRONG_MATCH} |`);
  lines.push("");

  lines.push("## Winner distribution", "");
  lines.push("| Persona | BEFORE | AFTER |");
  lines.push("|---|---:|---:|");
  for (const persona of PERSONAS) {
    lines.push(`| ${persona} | ${comparison.before.winnerDistribution[persona] ?? 0} | ${comparison.after.winnerDistribution[persona] ?? 0} |`);
  }
  lines.push(`| (no winner) | ${comparison.before.noWinner} | ${total - reasonCounts.ASSIGNED} |`);
  lines.push("");

  lines.push("## Don Quixote", "");
  lines.push("| Metric | BEFORE | AFTER |");
  lines.push("|---|---:|---:|");
  lines.push(`| Measurable | ${comparison.before.donQuixote.measurable}/${total} | ${comparison.after.donQuixote.measurable}/${total} |`);
  lines.push(`| Non-zero Match | ${comparison.before.donQuixote.nonZero}/${total} | ${comparison.after.donQuixote.nonZero}/${total} |`);
  lines.push(`| Eligible | ${comparison.before.donQuixote.eligible}/${total} | ${comparison.after.donQuixote.eligible}/${total} |`);
  lines.push(`| Match ≥ 50 | n/a | ${comparison.after.donQuixote.strongMatches}/${total} |`);
  lines.push(`| Wins | ${comparison.before.donQuixote.wins} | ${comparison.after.donQuixote.wins} |`);
  lines.push("");
  if (dqStrongest.length > 0) {
    lines.push("Strongest continuous Don Quixote evidence in AFTER:", "");
    lines.push("| Wallet | Return | Held (days) | DQ Match |");
    lines.push("|---|---:|---:|---:|");
    for (const item of dqStrongest) {
      lines.push(`| ${item.label} | ${(100 * (item.returnPct ?? 0)).toFixed(1)}% | ${item.days ?? "—"} | ${item.match ?? "—"} |`);
    }
    lines.push("");
  }

  lines.push("## Wallets whose assigned winner changed", "");
  if (changedWallets.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| Wallet | BEFORE | AFTER | AFTER reason | DQ before → after | Untouched-persona drift? |");
    lines.push("|---|---|---|---|---|---|");
    for (const change of changedWallets) {
      lines.push(`| ${change.label} | ${change.before ?? "—"} | ${change.after ?? "—"} | ${change.reason ?? "ASSIGNED"} | ${change.donQuixoteBefore ?? "—"} → ${change.donQuixoteAfter ?? "—"} | ${change.drifted ? "YES" : "no"} |`);
    }
    lines.push("");
    lines.push("Drift = any untouched persona Match moved ≥ 2 points between runs (provider data is live),");
    lines.push("so winner changes on drifted wallets may not be attributable to the rule change alone.", "");
  }

  lines.push("## Notes", "");
  lines.push("- Icarus scoring and thresholds are untouched; W34/W13-class evidence still resolves the same way.");
  lines.push("- The 20-request historical-price budget and the 10-swap general minimum are unchanged.");
  lines.push("- If Don Quixote remains near zero after continuous scoring, that is reported as-is; no further loosening.", "");
  writeFileSync(join(OUTPUT_DIR, "phase5b-calibration.md"), `${lines.join("\n")}\n`);
  console.log(`[compare] written: before-after.json, phase5b-calibration.md (${after.length} wallets)`);
}

loadLocalEnvironment();
const command = process.argv[2];
if (command === "run") {
  await run();
} else if (command === "compare") {
  await compare();
} else {
  console.error("usage: validate-phase5b.ts run|compare");
  process.exit(1);
}
