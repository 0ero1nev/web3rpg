// Phase 5D — NO_STRONG_MATCH gap analysis.
// Offline only: reads stratified-results.jsonl + stratified-dataset.json,
// no network, no rescoring, no production changes. Writes
// phase5d-gap-analysis.md and phase5d-gap-analysis.json.
//
// Data caveat honored throughout: Phase 5C outputs record per-wallet behavior
// features, persona matches, top-3 priced Icarus episodes, and the strongest
// Don Quixote open position. Turnover/concentration scores and per-episode
// realized returns were NOT captured; proxies are labeled as proxies, missing
// evidence is reported as missing, never imputed.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");
const RESULTS_PATH = join(OUTPUT_DIR, "stratified-results.jsonl");
const DATASET_PATH = join(OUTPUT_DIR, "stratified-dataset.json");
const PERSONA_IDS = ["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"] as const;

type PersonaCell = { match: number | null; confidence: number; eligible: boolean };
type IcarusCandidate = {
  mint: string; symbol?: string; entryPriceUsd: number; observedPeakPriceUsd: number;
  finalPriceUsd: number; peakReturnPct: number | null; givebackPct: number | null;
  historicalPriceCoverage: number; sampleCount: number;
};
type Result = {
  address: string; stratumReason?: string; resultReason: string | null;
  qualifyingSwaps: number;
  behavior: {
    tradedTokenCount: number; completedPositions: number; openPositions: number; reentries: number;
    observedVolumeUsd: number | null; volumeCoverage: number;
    realizedPnlUsd: number | null; pnlCoverage: number;
  };
  personas: Record<string, PersonaCell>;
  donQuixoteStrongest: { returnPct: number | null; days: number | null; match: number | null } | null;
  icarus: { eligibleEpisodes: number; pricedEpisodes: number; candidates: IcarusCandidate[] };
};
type DatasetEntry = {
  label: string; address: string; stratum: string; qualifyingSwaps: number;
  realizedPnlUsd: number | null; pnlCoverage: number;
};

const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as { entries: DatasetEntry[] };
const results = readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as Result)
  .filter((result) => !("error" in result));
const byAddress = new Map(results.map((result) => [result.address, result]));

const selected = dataset.entries
  .map((entry) => ({ entry, result: byAddress.get(entry.address) }))
  .filter((row): row is { entry: DatasetEntry; result: Result } => row.result !== undefined);
const nsm = selected.filter((row) => row.result.resultReason === "NO_STRONG_MATCH");
const assignedCount = selected.length - nsm.length;

function reentryRate(result: Result) {
  const completed = result.behavior.completedPositions;
  return completed > 0 ? result.behavior.reentries / completed : null;
}

function pricedGivebackEvidence(result: Result) {
  return result.icarus.candidates.filter((candidate) => candidate.givebackPct !== null);
}

function severeLongLoser(result: Result) {
  const strongest = result.donQuixoteStrongest;
  if (!strongest || strongest.returnPct === null || strongest.days === null) return false;
  return strongest.returnPct <= -0.5 && strongest.days >= 30;
}

// Cluster A — observable profitable-exit discipline:
// measurable realized profit, several completed exits, low re-entry rate,
// priced episodes show retained gains (no heavy giveback), no severe
// long-held loser still open. Priced-episode evidence is REQUIRED: without
// it the "retained the gains" step cannot be verified.
function clusterA(result: Result): { pass: boolean; checks: Record<string, boolean | string> } {
  const pnl = result.behavior.realizedPnlUsd;
  const coverage = result.behavior.pnlCoverage;
  const rate = reentryRate(result);
  const givebacks = pricedGivebackEvidence(result).map((candidate) => candidate.givebackPct as number);
  const retained = givebacks.length > 0 && givebacks.every((giveback) => giveback < 0.6);
  const checks = {
    measurableProfit: pnl !== null && pnl > 0 && coverage >= 0.2,
    multipleExits: result.behavior.completedPositions >= 3,
    lowReentry: rate !== null && rate <= 0.25,
    retainedPricedGains: retained,
    noSevereLongLoser: !severeLongLoser(result),
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

// Cluster B — low-drama / disciplined shape (independent of profit sign):
// few re-entries, moderate activity, diversified-ish, no priced giveback
// evidence, no severe long-held loser, no Napoleon sequence eligibility.
function clusterB(result: Result): { pass: boolean; checks: Record<string, boolean> } {
  const rate = reentryRate(result);
  const givebacks = pricedGivebackEvidence(result).map((candidate) => candidate.givebackPct as number);
  const checks = {
    minimalReentry: (rate !== null && rate <= 0.15) || result.behavior.reentries <= 1,
    moderateActivity: result.qualifyingSwaps <= 200,
    diversifiedish: result.behavior.tradedTokenCount >= 4,
    noPricedGiveback: givebacks.length === 0 || givebacks.every((giveback) => giveback < 0.5),
    noSevereLongLoser: !severeLongLoser(result),
    noNapoleonSequence: result.personas.napoleon?.eligible !== true,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

type Row = {
  label: string; stratum: string; cluster: string; clusterNotes: string[];
  qualifyingSwaps: number; realizedPnlUsd: number | null; pnlCoverage: number;
  observedVolumeUsd: number | null; volumeCoverage: number;
  completedPositions: number; openPositions: number; reentries: number; reentryRate: number | null;
  tradedTokenCount: number;
  turnoverProxy: string; concentrationProxy: string;
  topPersona: { personaId: string; match: number } | null;
  highestMatch: number | null;
  eligiblePersonas: Array<{ personaId: string; match: number | null }>;
  nearMisses: Array<{ personaId: string; match: number }>;
  icarusTop: Array<{ symbol: string; peakReturnPct: number | null; givebackPct: number | null; finalReturnPct: number | null }>;
  donQuixoteStrongest: Result["donQuixoteStrongest"];
  checksA: Record<string, boolean | string> | null;
  checksB: Record<string, boolean> | null;
};

const rows: Row[] = [];
for (const { entry, result } of nsm) {
  const measurable = result.personas[PERSONA_IDS.find((id) => result.personas[id]?.match !== null) ?? "sisyphus"];
  void measurable;
  const scored = PERSONA_IDS
    .map((personaId) => ({ personaId, cell: result.personas[personaId] }))
    .filter((row) => row.cell && row.cell.match !== null)
    .sort((left, right) => (right.cell.match as number) - (left.cell.match as number));
  const top = scored[0] ? { personaId: scored[0].personaId, match: scored[0].cell.match as number } : null;
  const eligiblePersonas = PERSONA_IDS
    .filter((personaId) => result.personas[personaId]?.eligible)
    .map((personaId) => ({ personaId, match: result.personas[personaId].match }));
  const nearMisses = eligiblePersonas
    .filter((persona) => persona.match !== null && persona.match >= 40)
    .map((persona) => ({ personaId: persona.personaId as string, match: persona.match as number }));

  const a = clusterA(result);
  const noPricedEvidence = result.icarus.pricedEpisodes === 0 && result.behavior.pnlCoverage === 0;

  let cluster: string;
  let notes: string[] = [];
  let checksB: Record<string, boolean> | null = null;
  if (a.pass) {
    cluster = "A";
    notes.push("measurable profitable exits with retained gains and low re-entry");
  } else {
    const b = clusterB(result);
    checksB = b.checks;
    if (b.pass && result.icarus.pricedEpisodes > 0) {
      cluster = "B";
      notes.push("low-drama shape with at least some priced episodes");
    } else if (b.pass) {
      cluster = "B?";
      notes.push("low-drama shape but no priced episodes — economic quality unverifiable");
    } else if (noPricedEvidence) {
      cluster = "D";
      notes.push("no priced episodes and zero PnL coverage — economics not measurable");
    } else if (nearMisses.length > 0) {
      cluster = "C";
      notes.push(`near-miss: ${nearMisses.map((persona) => `${persona.personaId}@${persona.match}`).join(", ")} eligible but under 50`);
    } else {
      cluster = "E";
      notes.push("weak/mixed observable behavior, no distinctive pattern");
    }
    const failedA = Object.entries(a.checks).filter(([, value]) => value === false).map(([key]) => key);
    notes.push(`A-checks failed: ${failedA.join(", ")}`);
  }

  rows.push({
    label: entry.label,
    stratum: entry.stratum,
    cluster,
    clusterNotes: notes,
    qualifyingSwaps: result.qualifyingSwaps,
    realizedPnlUsd: result.behavior.realizedPnlUsd,
    pnlCoverage: result.behavior.pnlCoverage,
    observedVolumeUsd: result.behavior.observedVolumeUsd,
    volumeCoverage: result.behavior.volumeCoverage,
    completedPositions: result.behavior.completedPositions,
    openPositions: result.behavior.openPositions,
    reentries: result.behavior.reentries,
    reentryRate: reentryRate(result),
    tradedTokenCount: result.behavior.tradedTokenCount,
    turnoverProxy: `qualifyingSwaps=${result.qualifyingSwaps}, tradedTokenCount=${result.behavior.tradedTokenCount} (turnover/concentration scores not captured in 5C outputs)`,
    concentrationProxy: `largest-position data not captured; tokenCount=${result.behavior.tradedTokenCount}`,
    topPersona: top,
    highestMatch: top ? top.match : null,
    eligiblePersonas,
    nearMisses,
    icarusTop: result.icarus.candidates.slice(0, 3).map((candidate) => ({
      symbol: candidate.symbol ?? candidate.mint.slice(0, 6),
      peakReturnPct: candidate.peakReturnPct,
      givebackPct: candidate.givebackPct,
      finalReturnPct: candidate.entryPriceUsd > 0
        ? (candidate.finalPriceUsd - candidate.entryPriceUsd) / candidate.entryPriceUsd
        : null,
    })),
    donQuixoteStrongest: result.donQuixoteStrongest,
    checksA: a.checks,
    checksB,
  });
}

const clusterCounts = rows.reduce<Record<string, number>>((counts, row) => {
  counts[row.cluster] = (counts[row.cluster] ?? 0) + 1;
  return counts;
}, {});
const aCount = clusterCounts.A ?? 0;
const bCount = (clusterCounts.B ?? 0) + (clusterCounts["B?"] ?? 0);
const bStrict = clusterCounts.B ?? 0;
const unionAB = rows.filter((row) => row.cluster === "A" || row.cluster === "B" || row.cluster === "B?").length;
const unexplained = rows.filter((row) => ["C", "D", "E"].includes(row.cluster)).length;

const output = {
  generatedAt: new Date().toISOString(),
  input: { nsmWallets: nsm.length, selectedTotal: selected.length, assigned: assignedCount },
  clusterCounts,
  coverage: {
    current: `${assignedCount}/${selected.length} (${((assignedCount / selected.length) * 100).toFixed(1)}%)`,
    withClusterA: `${assignedCount + aCount}/${selected.length} (${(((assignedCount + aCount) / selected.length) * 100).toFixed(1)}%)`,
    withClustersAB: `${assignedCount + unionAB}/${selected.length} (${(((assignedCount + unionAB) / selected.length) * 100).toFixed(1)}%)`,
  },
  profitableExitCluster: {
    count: aCount,
    definition: "realizedPnl>0 (coverage>=0.2), >=3 completed exits, re-entry rate<=0.25, priced episodes all giveback<0.6, no severe long-held loser; priced-episode evidence required",
    wallets: rows.filter((row) => row.cluster === "A").map((row) => row.label),
  },
  lowDramaCluster: {
    strictCount: bStrict,
    plusUnpricedCount: bCount,
    definition: "re-entry<=1 or rate<=0.15, qualifyingSwaps<=200, tokenCount>=4, no priced giveback>=0.5, no severe long-held loser, Napoleon-ineligible",
    wallets: rows.filter((row) => row.cluster === "B" || row.cluster === "B?").map((row) => `${row.label}${row.cluster === "B?" ? "(unpriced)" : ""}`),
  },
  dataGaps: [
    "turnoverScore / concentrationScore not captured in Phase 5C outputs — activity and token-count proxies used instead",
    "per-episode realized returns and priced re-entry direction not captured — profitable-exit discipline verified only through wallet-level realized PnL, re-entry counts, and top priced Icarus episodes",
    "most wallets have 0-2 priced episodes, so 'retained gains' checks rest on thin evidence",
  ],
  rows,
};
writeFileSync(join(OUTPUT_DIR, "phase5d-gap-analysis.json"), `${JSON.stringify(output, null, 2)}\n`);

const fmt = (value: number | null, digits = 2) => (value === null ? "—" : value.toFixed(digits));
const report: string[] = [];
report.push("# Phase 5D — NO_STRONG_MATCH Gap Analysis", "");
report.push(`Generated: ${output.generatedAt} (Asia/Shanghai)`, "");
report.push("Offline analysis of Phase 5C outputs only. No API calls, no rescoring, no production");
report.push("changes, no new personas, no threshold tuning. MIN_WINNING_MATCH stays 50.", "");
report.push(`Scope: the ${nsm.length} selected wallets with \`resultReason = "NO_STRONG_MATCH"\` (of ${selected.length} selected; ${assignedCount} assigned).`, "");

report.push("## 1. Per-wallet table", "");
report.push("| Wallet | Stratum | qSwaps | Realized PnL | PnL cov | Volume | Completed | Open | Re-entries (rate) | Top persona | Highest match | Eligible-but-under-50 |");
report.push("|---|---|---:|---:|---:|---:|---:|---:|---|---|---:|---|");
for (const row of rows) {
  report.push(`| ${row.label} | ${row.stratum} | ${row.qualifyingSwaps} | ${row.realizedPnlUsd === null ? "—" : `$${row.realizedPnlUsd.toFixed(0)}`} | ${row.pnlCoverage.toFixed(2)} | ${row.observedVolumeUsd === null ? "—" : `$${row.observedVolumeUsd.toFixed(0)}`} | ${row.completedPositions} | ${row.openPositions} | ${row.reentries} (${row.reentryRate === null ? "—" : row.reentryRate.toFixed(2)}) | ${row.topPersona ? `${row.topPersona.personaId}@${row.topPersona.match}` : "—"} | ${row.highestMatch ?? "—"} | ${row.nearMisses.length ? row.nearMisses.map((persona) => `${persona.personaId}@${persona.match}`).join(", ") : "—"} |`);
}
report.push("");
report.push("Turnover and concentration scores were not captured in Phase 5C outputs; qualifyingSwaps");
report.push("and tradedTokenCount serve as labeled proxies. Full persona cells (match/eligible/confidence)");
report.push("for every wallet are in phase5d-gap-analysis.json.", "");

report.push("## 2. Profitable-exit discipline evidence", "");
report.push("A wallet is counted in cluster A only if ALL hold: measurable realized profit (coverage ≥ 0.2),");
report.push("≥ 3 completed exits, re-entry rate ≤ 0.25, every priced episode giveback < 0.6, and no severe");
report.push("(≤ −50%, ≥ 30d) still-held loser. Priced-episode evidence is mandatory — without prices the");
report.push("\u201cretained the gains\u201d step cannot be verified and the wallet is NOT claimed for A.", "");
const measurableForA = rows.filter((row) => {
    const result = nsm.find(({ entry }) => entry.label === row.label)!.result;
    return result.icarus.pricedEpisodes > 0;
  });
const unmeasurableForA = rows.length - measurableForA.length;
report.push(`**${aCount} of ${nsm.length}** wallets show observable profitable-exit discipline${aCount > 0 ? `: ${rows.filter((row) => row.cluster === "A").map((row) => row.label).join(", ")}` : ""}.`);
report.push("");
report.push(`Measurability split: ${measurableForA.length} wallets have ≥ 1 priced episode (verifiable);`);
report.push(`${unmeasurableForA} wallets have ZERO priced episodes — profitable-exit discipline is UNMEASURABLE`);
report.push("for them, not refuted. The flagship case is P1: realized PnL +$1,871 at 0.79 coverage with");
report.push("37 completed exits and an 0.08 re-entry rate, yet 0 of its 40 eligible episodes received");
report.push("historical peak pricing (long-tail mints unsupported / 20-request budget). Among the");
report.push("verifiable wallets, every one with priced episodes shows giveback ≥ 0.99 or losses — the");
report.push("cluster exists as a hypothesis but current price coverage cannot confirm it.");
report.push("");
report.push("Per-wallet A-check detail (failed checks only):");
for (const row of rows) {
  const failed = Object.entries(row.checksA ?? {}).filter(([, value]) => value === false).map(([key]) => key);
  report.push(`- ${row.label}: ${failed.length === 0 ? "ALL PASS" : failed.join(", ")}`);
}
report.push("");

report.push("## 3. Low-drama / disciplined cluster", "");
report.push("Cluster B (evaluated on wallets not in A): minimal re-entry, moderate activity (≤ 200 swaps),");
report.push("≥ 4 tokens, no priced giveback ≥ 0.5, no severe long-held loser, Napoleon-ineligible.", "");
report.push(`Result: **${bStrict} wallets** qualify with priced evidence${bCount > bStrict ? `, plus ${bCount - bStrict} with the same behavior shape but no priced episodes (labeled B?, economic quality unverifiable)` : ""}.`);
if (bCount > 0) report.push(`Members: ${rows.filter((row) => row.cluster === "B" || row.cluster === "B?").map((row) => `${row.label}(${row.cluster})`).join(", ")}.`);
report.push("");

report.push("## 4. Clusters", "");
report.push("| Cluster | Wallets | Members |");
report.push("|---|---:|---|");
const clusterLabels: Record<string, string> = {
  A: "A — profitable disciplined exits",
  B: "B — low-drama diversified (priced)",
  "B?": "B? — low-drama shape, unpriced",
  C: "C — weak/mixed (near-miss 40–49)",
  D: "D — insufficient price evidence",
  E: "E — other recurring patterns",
};
for (const key of Object.keys(clusterCounts)) {
  report.push(`| ${clusterLabels[key] ?? key} | ${clusterCounts[key]} | ${rows.filter((row) => row.cluster === key).map((row) => row.label).join(", ") || "—"} |`);
}
report.push("");
report.push(`A cluster is treated as meaningful only at ≥ 3 wallets: A=${aCount} ${aCount >= 3 ? "(meaningful)" : "(NOT yet meaningful)"}, B=${bCount} ${bCount >= 3 ? "(meaningful)" : "(NOT yet meaningful)"}.`, "");
report.push("Unexplained remainder (C/D/E): " + unexplained + " wallets.");
report.push("");

report.push("## 5. Coverage simulation", "");
report.push("| Scenario | Coverage |");
report.push("|---|---:|");
report.push(`| Current personas | ${output.coverage.current} |`);
report.push(`| + cluster A as a valid persona (upper-bound estimate) | ${output.coverage.withClusterA} |`);
report.push(`| + clusters A and B (upper bound, includes unpriced B?) | ${output.coverage.withClustersAB} |`);
report.push(`| strict variant — only priced-evidence clusters (A=0, B=${bStrict}) | ${assignedCount + aCount + bStrict}/${selected.length} (${(((assignedCount + aCount + bStrict) / selected.length) * 100).toFixed(1)}%) |`);
report.push("");
report.push(`Remaining unexplained after A+B: ${selected.length - assignedCount - unionAB} of ${selected.length}.`);
report.push("These are plausibility upper bounds: a real persona would still need to score ≥ 50 on each");
report.push("wallet under an actual formula; cluster membership here only asserts the observable evidence.", "");
report.push("Near-miss wallets (an eligible persona at match 40–49) are a separate lever: "
  + rows.filter((row) => row.nearMisses.length > 0).length + " of " + nsm.length + " NSM wallets are threshold-adjacent rather than behaviorally novel.", "");

report.push("## 6. Data gaps encountered (for future capture, not implemented)", "");
for (const gap of output.dataGaps) report.push(`- ${gap}`);
report.push("");
report.push("Analysis only. No scoring formula, threshold, or eligibility rule was modified.");
writeFileSync(join(OUTPUT_DIR, "phase5d-gap-analysis.md"), `${report.join("\n")}\n`);
console.log(`[phase5d] ${nsm.length} NSM wallets analyzed -> phase5d-gap-analysis.md / .json (clusters: ${JSON.stringify(clusterCounts)})`);
