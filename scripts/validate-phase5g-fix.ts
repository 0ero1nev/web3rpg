// Phase 5G — Match integrity fix verification.
//   run    — re-analyze the EXACT Phase 5C stratified 40 with the FIXED
//            weightedValue (declared-total-weight division), appending to
//            phase5g-results.jsonl (resume-safe).
//   report — BEFORE (stratified-results.jsonl) vs AFTER comparison plus the
//            Sisyphus core-component minimum simulations (20/30/40 + null
//            failure), writing phase5g-integrity-fix.{md,json}.
// The only production change under test is weightedValue; eligibility gates,
// MIN_WINNING_MATCH, other formulas, parser, and pricing are untouched.

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
const DATASET_PATH = join(OUTPUT_DIR, "stratified-dataset.json");
const BEFORE_PATH = join(OUTPUT_DIR, "stratified-results.jsonl");
const AFTER_PATH = join(OUTPUT_DIR, "phase5g-results.jsonl");
const WALLET_PAUSE_MS = 8_000;
const PERSONA_IDS = ["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"] as const;

type DatasetEntry = { label: string; address: string; stratum: string };
type Result = {
  address: string; resultReason: string | null; qualifyingSwaps: number;
  behavior: {
    tradedTokenCount: number; completedPositions: number; openPositions: number; reentries: number;
    observedVolumeUsd: number | null; volumeCoverage: number;
    realizedPnlUsd: number | null; pnlCoverage: number;
  };
  personas: Record<string, { match: number | null; confidence: number; eligible: boolean }>;
  winner: { personaId: string; match: number } | null;
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
  const positionPerformance = await buildPositionPerformance(behavior, holdings, { historyComplete: raw.historyComplete });
  const tradeSequences = analyzeTradeSequences(positionPerformance);
  const ranking = scorePersonas(behavior, {
    historyComplete: raw.historyComplete,
    positionPerformance,
    tradeSequences,
  });
  const priceValidation = buildPriceCoverageValidation(positionPerformance);
  return {
    address: entry.address,
    label: entry.label,
    stratum: entry.stratum,
    elapsedMs: Date.now() - startedAt,
    historyComplete: raw.historyComplete,
    transactionsAnalyzed: valued.transactions.length,
    qualifyingSwaps: ranking.qualifyingSwaps,
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
    personas: Object.fromEntries(ranking.scores.map((score) => [
      score.personaId,
      { match: score.match, confidence: score.confidence, eligible: score.eligible },
    ])),
    winner: ranking.winner ? { personaId: ranking.winner.personaId, match: ranking.winner.match } : null,
    icarusPricedEpisodes: priceValidation.historical.historicalPricePricedEpisodes,
    cost: { providerFailures: positionPerformance.costReport.providerFailures },
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
  for (const [index, entry] of dataset.entries.entries()) {
    if (done.has(entry.address)) continue;
    try {
      const result = await analyzeWallet(entry);
      appendFileSync(AFTER_PATH, `${JSON.stringify(result)}\n`);
      console.log(`[run ${index + 1}/${dataset.entries.length}] ${entry.label} winner=${result.winner ? `${result.winner.personaId}@${result.winner.match}` : `NONE(${result.resultReason})`} newton=${result.personas.newton.match} sisyphus=${result.personas.sisyphus.match}`);
    } catch (error) {
      appendFileSync(AFTER_PATH, `${JSON.stringify({ address: entry.address, label: entry.label, error: error instanceof Error ? error.message : String(error) })}\n`);
      console.log(`[run] ${entry.label} FAILED: ${error instanceof Error ? error.message : error}`);
    }
    if (index < dataset.entries.length - 1) await new Promise((resolve) => setTimeout(resolve, WALLET_PAUSE_MS));
  }
  console.log("[run] complete");
}

function report() {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as { entries: DatasetEntry[] };
  const read = (path: string) => readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as Result & { label?: string; error?: string })
    .filter((row) => !row.error);
  const datasetAddresses = new Set(dataset.entries.map((entry) => entry.address));
  const before = read(BEFORE_PATH).filter((row) => datasetAddresses.has(row.address));
  const after = read(AFTER_PATH);
  const labelOf = new Map(dataset.entries.map((entry) => [entry.address, entry.label]));
  const beforeByAddress = new Map(before.map((row) => [row.address, row]));
  const total = after.length;

  const distribution = (rows: Result[]) => {
    const counts: Record<string, number> = {};
    for (const row of rows) if (row.winner) counts[row.winner.personaId] = (counts[row.winner.personaId] ?? 0) + 1;
    return counts;
  };
  const assignedBefore = before.filter((row) => row.winner).length;
  const assignedAfter = after.filter((row) => row.winner).length;
  const matchAbove = (rows: Result[], personaId: string) => rows.filter((row) => (row.personas[personaId]?.match ?? 0) >= 50).length;

  const winnerChanges: Array<{ label: string; from: string | null; to: string | null; reason: string | null; drifted: boolean }> = [];
  const matchChanges: Array<{ label: string; persona: string; before: number | null; after: number | null; delta: number; attribution: string }> = [];
  for (const afterRow of after) {
    const beforeRow = beforeByAddress.get(afterRow.address);
    if (!beforeRow) continue;
    const label = labelOf.get(afterRow.address) ?? afterRow.label ?? afterRow.address.slice(0, 8);
    const beforeWinner = beforeRow.winner?.personaId ?? null;
    const afterWinner = afterRow.winner?.personaId ?? null;
    if (beforeWinner !== afterWinner) {
      // Drift = an untouched persona's match moved >= 2 (live provider data).
      const drifted = PERSONA_IDS.some((personaId) => {
        if (personaId === "newton" || personaId === "sisyphus") return false;
        const b = beforeRow.personas[personaId]?.match ?? null;
        const a = afterRow.personas[personaId]?.match ?? null;
        if (b === null || a === null) return b !== a;
        return Math.abs(a - b) >= 2;
      });
      winnerChanges.push({ label, from: beforeWinner, to: afterWinner, reason: afterRow.resultReason, drifted });
    }
    for (const personaId of PERSONA_IDS) {
      const b = beforeRow.personas[personaId]?.match ?? null;
      const a = afterRow.personas[personaId]?.match ?? null;
      if (b === null && a === null) continue;
      const delta = (a ?? 0) - (b ?? 0);
      if (Math.abs(delta) >= 10) {
        const attribution = personaId === "newton"
          ? (afterRow.behavior.reentries === 0 ? "integrity fix: zero re-entries -> ACTIVITY-only weight 0.10" : "drift or partial-evidence renormalization change")
          : personaId === "sisyphus"
            ? (afterRow.behavior.realizedPnlUsd === null || beforeRow.behavior.realizedPnlUsd === null ? "integrity fix: null stagnation no longer renormalized" : "drift (stagnation was measurable both runs)")
            : "shared weightedValue fix on a null dimension, or live-data drift";
        matchChanges.push({ label, persona: personaId, before: b, after: a, delta, attribution });
      }
    }
  }

  // §2 verification: the previously identified zero-reentry high-Match Newton cases.
  const zeroReentryBefore = before.filter((row) => (row.personas.newton?.match ?? 0) >= 50 && row.behavior.reentries === 0);
  const zeroReentryVerification = zeroReentryBefore.map((row) => {
    const afterRow = after.find((candidate) => candidate.address === row.address);
    return {
      label: labelOf.get(row.address) ?? row.address.slice(0, 8),
      newtonBefore: row.personas.newton.match,
      newtonAfter: afterRow?.personas.newton.match ?? null,
      stillAbove50: (afterRow?.personas.newton.match ?? 0) >= 50,
    };
  });
  // §3 verification: null-stagnation Sisyphus wallets.
  const nullStagnation = after.filter((row) => row.behavior.realizedPnlUsd === null && (beforeByAddress.get(row.address)?.personas.sisyphus.match ?? 0) >= 50)
    .map((row) => ({
      label: labelOf.get(row.address) ?? row.address.slice(0, 8),
      sisyphusBefore: beforeByAddress.get(row.address)?.personas.sisyphus.match ?? null,
      sisyphusAfter: row.personas.sisyphus.match,
    }));

  // Sisyphus core-component minimum simulations (stagnation mirror from 5F, validated).
  const toScore = (value: number) => Math.max(0, Math.min(1, value)) * 100;
  const stagnationOf = (row: Result) => {
    const pnl = row.behavior.realizedPnlUsd;
    const volume = row.behavior.observedVolumeUsd;
    if (pnl === null || volume === null || volume <= 0) return null;
    return 100 - toScore(Math.abs(pnl / volume) / 0.10);
  };
  const simulations = [20, 30, 40].map((minimum) => {
    const affected: string[] = [];
    const distributionSim: Record<string, number> = {};
    let assigned = 0;
    let above50 = 0;
    let eligible = 0;
    for (const row of after) {
      const stagnation = stagnationOf(row);
      const corePass = stagnation !== null && stagnation >= minimum;
      const sisyphusEligible = row.personas.sisyphus?.eligible === true && corePass;
      const sisyphusMatch = row.personas.sisyphus?.match ?? 0;
      if (sisyphusMatch >= 50) above50 += 1;
      if (sisyphusEligible) eligible += 1;
      const ranked = PERSONA_IDS
        .filter((personaId) => (personaId === "sisyphus" ? sisyphusEligible : row.personas[personaId]?.eligible === true))
        .filter((personaId) => ((personaId === "sisyphus" ? sisyphusMatch : row.personas[personaId]?.match ?? 0) >= 50))
        .sort((left, right) => ((personaIdOf(row, right, sisyphusMatch)) - (personaIdOf(row, left, sisyphusMatch))));
      const winner = ranked[0] ?? null;
      const label = labelOf.get(row.address) ?? row.address.slice(0, 8);
      if (winner) {
        assigned += 1;
        distributionSim[winner] = (distributionSim[winner] ?? 0) + 1;
      }
      if (row.winner?.personaId === "sisyphus" && !winner) affected.push(`${label}(lost)`);
      if (row.winner?.personaId !== "sisyphus" && winner === "sisyphus") affected.push(`${label}(gained)`);
    }
    return { minimum, sisyphusAbove50: above50, sisyphusEligible: eligible, assigned, coverage: `${assigned}/${total}`, distribution: distributionSim, affected };
  });
  function personaIdOf(row: Result, personaId: string, sisyphusMatch: number) {
    return personaId === "sisyphus" ? sisyphusMatch : row.personas[personaId]?.match ?? 0;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    productionChange: "weightedValue now divides by declared total weight (personaScoring.ts); exported for tests; no other formula, gate, or threshold touched",
    before: {
      assigned: assignedBefore, coverage: `${assignedBefore}/${before.length}`,
      winnerDistribution: distribution(before),
      newtonAbove50: matchAbove(before, "newton"),
      sisyphusAbove50: matchAbove(before, "sisyphus"),
      noStrongMatch: before.filter((row) => row.resultReason === "NO_STRONG_MATCH").length,
    },
    after: {
      assigned: assignedAfter, coverage: `${assignedAfter}/${total}`,
      winnerDistribution: distribution(after),
      newtonAbove50: matchAbove(after, "newton"),
      sisyphusAbove50: matchAbove(after, "sisyphus"),
      noStrongMatch: after.filter((row) => row.resultReason === "NO_STRONG_MATCH").length,
    },
    winnerChanges,
    matchChangesAbove10: matchChanges,
    zeroReentryNewtonVerification: {
      cases: zeroReentryVerification,
      stillAbove50Count: zeroReentryVerification.filter((row) => row.stillAbove50).length,
    },
    nullStagnationSisyphus: nullStagnation,
    coreMinimumSimulations: simulations,
    coreMinimumDecision: "NOT IMPLEMENTED — no candidate (20/30/40) has a clear semantic justification; they map to arbitrary |progress| cutoffs (8%/7%/6% of volume) on a continuous scale whose existing semantic anchor is meaningfulProgressRate = 0.10 (stagnation > 0). Reported per spec; left unimplemented.",
  };
  writeFileSync(join(OUTPUT_DIR, "phase5g-integrity-fix.json"), `${JSON.stringify(output, null, 2)}\n`);

  const md: string[] = [];
  md.push("# Phase 5G — Match Integrity Fix", "");
  md.push(`Generated: ${output.generatedAt} (Asia/Shanghai)`, "");
  md.push("Production change: `weightedValue` divides by the TOTAL DECLARED weight (null dimensions keep");
  md.push("their weight in the denominator). Unit tests cover all/one/multiple/all-null cases plus the");
  md.push("Phase 5F example. No persona formulas, gates, MIN_WINNING_MATCH, parser, or pricing touched.", "");
  md.push("## BEFORE vs AFTER (same 40-wallet stratified dataset, re-run with fixed code)", "");
  md.push("| Metric | BEFORE | AFTER |");
  md.push("|---|---:|---:|");
  md.push(`| Assigned | ${assignedBefore}/${before.length} (${((assignedBefore / before.length) * 100).toFixed(1)}%) | ${assignedAfter}/${total} (${((assignedAfter / total) * 100).toFixed(1)}%) |`);
  md.push(`| Newton Match >= 50 | ${output.before.newtonAbove50} | ${output.after.newtonAbove50} |`);
  md.push(`| Sisyphus Match >= 50 | ${output.before.sisyphusAbove50} | ${output.after.sisyphusAbove50} |`);
  md.push(`| NO_STRONG_MATCH | ${output.before.noStrongMatch} | ${output.after.noStrongMatch} |`);
  md.push("");
  md.push(`Winner distribution BEFORE: ${Object.entries(output.before.winnerDistribution).map(([id, c]) => `${id}×${c}`).join(", ")}`);
  md.push("");
  md.push(`Winner distribution AFTER: ${Object.entries(output.after.winnerDistribution).map(([id, c]) => `${id}×${c}`).join(", ")}`);
  md.push("");
  md.push("### Winner changes", "");
  if (winnerChanges.length === 0) md.push("None.");
  for (const change of winnerChanges) {
    md.push(`- ${change.label}: ${change.from ?? "—"} -> ${change.to ?? `— (${change.reason})`}${change.drifted ? " [live-data drift detected on untouched personas]" : ""}`);
  }
  md.push("");
  md.push("### Match changes >= 10 points", "");
  if (matchChanges.length === 0) md.push("None.");
  for (const change of matchChanges) {
    md.push(`- ${change.label} ${change.persona}: ${change.before ?? "—"} -> ${change.after ?? "—"} (${change.delta >= 0 ? "+" : ""}${change.delta}) — ${change.attribution}`);
  }
  md.push("");
  md.push("## Verification", "");
  md.push(`**Newton §2:** ${zeroReentryVerification.length} previously identified zero-reentry Match>=50 cases;`);
  md.push(`${output.zeroReentryNewtonVerification.stillAbove50Count} remain >= 50 after the fix.`);
  for (const row of zeroReentryVerification) {
    md.push(`- ${row.label}: ${row.newtonBefore} -> ${row.newtonAfter}${row.stillAbove50 ? " (STILL >= 50 — inspect)" : ""}`);
  }
  md.push("");
  md.push("**Sisyphus §3 (renormalization):** null-stagnation wallets after the fix:");
  for (const row of nullStagnation) {
    md.push(`- ${row.label}: ${row.sisyphusBefore} -> ${row.sisyphusAfter}`);
  }
  md.push("");
  md.push("## Sisyphus core-component minimum simulations (NOT implemented)", "");
  md.push("| Minimum | Sisyphus >= 50 | Eligible | Assigned | Coverage | Affected |");
  md.push("|---:|---:|---:|---:|---|---|");
  for (const simulation of simulations) {
    md.push(`| ${simulation.minimum} | ${simulation.sisyphusAbove50} | ${simulation.sisyphusEligible} | ${simulation.assigned} | ${simulation.coverage} | ${simulation.affected.join(", ") || "none"} |`);
  }
  md.push("");
  md.push(`Decision: ${output.coreMinimumDecision}`);
  md.push("");
  md.push("Note: weightedValue is shared infrastructure; Caesar/Croesus matches also change when one of");
  md.push("their dimensions is null — that is the intended semantics (missing evidence no longer donates");
  md.push("weight), not a formula modification. Live-data drift between runs is flagged where detected.");
  md.push("");
  writeFileSync(join(OUTPUT_DIR, "phase5g-integrity-fix.md"), `${md.join("\n")}\n`);
  console.log(`[phase5g] assigned ${assignedBefore}->${assignedAfter}; newton>=50 ${output.before.newtonAbove50}->${output.after.newtonAbove50}; sisyphus>=50 ${output.before.sisyphusAbove50}->${output.after.sisyphusAbove50}; zero-reentry still>=50: ${output.zeroReentryNewtonVerification.stillAbove50Count}`);
}

loadLocalEnvironment();
const command = process.argv[2];
if (command === "run") await run();
else if (command === "report") report();
else {
  console.error("usage: validate-phase5g-fix.ts run|report");
  process.exit(1);
}
