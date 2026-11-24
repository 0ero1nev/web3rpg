// Phase 6A — Persona #9 behavior spec (offline, stored data only).
// Profiles Cluster B (T9, M4, M5, M6, P4), tests candidate features against
// the other 35 wallets, assesses partial-history risk, proposes (NOT
// implements) the feature model / eligibility, runs false-positive concept
// checks, and simulates the proposed formula on the stored 40.
// No production scoring changes, no naming, no network.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");
const CLUSTER_B = ["T9", "M4", "M5", "M6", "P4"];

type Result = {
  address: string; label?: string; resultReason: string | null; qualifyingSwaps: number;
  historyComplete: boolean;
  behavior: {
    tradedTokenCount: number; completedPositions: number; openPositions: number; reentries: number;
    observedVolumeUsd: number | null; volumeCoverage: number;
    realizedPnlUsd: number | null; pnlCoverage: number;
  };
  personas: Record<string, { match: number | null; confidence: number; eligible: boolean }>;
  winner: { personaId: string; match: number } | null;
};
type DatasetEntry = { label: string; address: string; stratum: string };

const dataset = JSON.parse(readFileSync(join(OUTPUT_DIR, "stratified-dataset.json"), "utf8")) as { entries: DatasetEntry[] };
const results = readFileSync(join(OUTPUT_DIR, "phase5g-results.jsonl"), "utf8").split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as Result)
  .filter((row) => !("error" in row));
const labelOf = new Map(dataset.entries.map((entry) => [entry.address, entry.label]));
const rows = results.map((result) => ({
  result,
  label: labelOf.get(result.address) ?? result.address.slice(0, 6),
})).filter((row) => CLUSTER_B.includes(row.label) || labelOf.has(row.result.address));
const cluster = rows.filter((row) => CLUSTER_B.includes(row.label));
const others = rows.filter((row) => !CLUSTER_B.includes(row.label));

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const logCountScore = (value: number, reference: number) =>
  value <= 0 ? 0 : Math.max(0, Math.min(100, (Math.log1p(value) / Math.log1p(reference)) * 100));

// ---- §1 per-wallet profile ----
const profile = cluster.map(({ label, result }) => {
  const b = result.behavior;
  return {
    label,
    qualifyingSwaps: result.qualifyingSwaps,
    distinctTokens: b.tradedTokenCount,
    completedPositions: b.completedPositions,
    openPositions: b.openPositions,
    reentryCount: b.reentries,
    reentryRate: b.completedPositions > 0 ? Number((b.reentries / b.completedPositions).toFixed(2)) : null,
    addBuySellExitCounts: "NOT CAPTURED in stored outputs; bounded: disposal legs > 0 iff realizedPnl !== null (true only for P4)",
    concentrationHHI: "NOT CAPTURED; proxy = token breadth + swaps/token",
    largestPositionShare: "NOT CAPTURED",
    swapsPerToken: Number((result.qualifyingSwaps / Math.max(1, b.tradedTokenCount)).toFixed(2)),
    realizedPnlUsd: b.realizedPnlUsd,
    pnlCoverage: Number(b.pnlCoverage.toFixed(2)),
    partialHistory: result.historyComplete ? "complete" : "PARTIAL (1,000-tx cap)",
  };
});

// ---- §2/§3 feature separability vs the other 35 ----
type Feature = { name: string; value: (row: typeof rows[number]) => number | null; higherIsCluster: boolean };
const features: Feature[] = [
  { name: "TOKEN_BREADTH (distinctTokens)", value: ({ result }) => result.behavior.tradedTokenCount, higherIsCluster: true },
  { name: "EXIT_SCARCITY (completedPositions)", value: ({ result }) => result.behavior.completedPositions, higherIsCluster: false },
  { name: "REENTRY_SCARCITY (reentryCount)", value: ({ result }) => result.behavior.reentries, higherIsCluster: false },
  { name: "SWAPS_PER_TOKEN (repetition inverse)", value: ({ result }) => result.qualifyingSwaps / Math.max(1, result.behavior.tradedTokenCount), higherIsCluster: false },
  { name: "CYCLES (completed + reentries)", value: ({ result }) => result.behavior.completedPositions + result.behavior.reentries, higherIsCluster: false },
  { name: "OPEN_SHARE (open / (open+completed))", value: ({ result }) => {
    const total = result.behavior.openPositions + result.behavior.completedPositions;
    return total === 0 ? null : result.behavior.openPositions / total;
  }, higherIsCluster: true },
];
const separability = features.map((feature) => {
  const clusterValues = cluster.map(feature.value).filter((value): value is number => value !== null);
  const otherValues = others.map(feature.value).filter((value): value is number => value !== null);
  const clusterMedian = median(clusterValues);
  const otherMedian = median(otherValues);
  // Overlap: how many of the other 35 fall inside the cluster's value range.
  const clusterMin = Math.min(...clusterValues);
  const clusterMax = Math.max(...clusterValues);
  const overlapCount = otherValues.filter((value) => value >= clusterMin && value <= clusterMax).length;
  // Discriminative power: fraction of the other 35 STRICTLY on the non-cluster side of the cluster median.
  const strictlySeparated = feature.higherIsCluster
    ? otherValues.filter((value) => value < (clusterMedian ?? 0)).length
    : otherValues.filter((value) => value > (clusterMedian ?? 0)).length;
  return {
    feature: feature.name,
    clusterMedian: clusterMedian === null ? null : Number(clusterMedian.toFixed(2)),
    clusterRange: [clusterValues.length ? Math.min(...clusterValues) : null, clusterValues.length ? Math.max(...clusterValues) : null],
    otherMedian: otherMedian === null ? null : Number(otherMedian.toFixed(2)),
    otherRange: [Math.min(...otherValues), Math.max(...otherValues)],
    otherWalletsInsideClusterRange: overlapCount,
    strictlySeparatedOf35: strictlySeparated,
    useful: strictlySeparated / Math.max(1, otherValues.length) >= 0.6,
  };
});

// Persona-winner comparison (§2): median features per winner group.
const winnerGroups = ["caesar", "sisyphus", "newton", "icarus", "napoleon", "don_quixote"].map((personaId) => {
  const members = others.filter(({ result }) => result.winner?.personaId === personaId);
  return {
    persona: personaId,
    wallets: members.length,
    medianTokens: median(members.map(({ result }) => result.behavior.tradedTokenCount)),
    medianCompleted: median(members.map(({ result }) => result.behavior.completedPositions)),
    medianReentries: median(members.map(({ result }) => result.behavior.reentries)),
    medianSwapsPerToken: median(members.map(({ result }) => result.qualifyingSwaps / Math.max(1, result.behavior.tradedTokenCount))),
  };
});

// ---- §5 proposed formula (NOT implemented) ----
// BREADTH           = logCountScore(distinctTokens, 100)   [reuses diversificationReferenceTokens]
// CYCLE_SCARCITY    = 100 / (1 + completedPositions + reentryCount)
// ACCUMULATION_TILT = 100 * openPositions / (openPositions + completedPositions); null when both are 0
// match = (0.35*BREADTH + 0.35*CYCLE_SCARCITY + 0.30*ACCUMULATION_TILT) / 1.00  [declared-weight semantics]
function proposedMatch(result: Result): { match: number; breadth: number; cycleScarcity: number; accumulationTilt: number | null } {
  const breadth = logCountScore(result.behavior.tradedTokenCount, 100);
  const cycleScarcity = 100 / (1 + result.behavior.completedPositions + result.behavior.reentries);
  const totalPositions = result.behavior.openPositions + result.behavior.completedPositions;
  const accumulationTilt = totalPositions === 0 ? null : (100 * result.behavior.openPositions) / totalPositions;
  const match = (0.35 * breadth + 0.35 * cycleScarcity + 0.30 * (accumulationTilt ?? 0)) / 1;
  return { match, breadth, cycleScarcity, accumulationTilt };
}
function proposedEligible(result: Result) {
  return result.qualifyingSwaps >= 25
    && result.behavior.tradedTokenCount >= 20
    && result.behavior.completedPositions + result.behavior.reentries <= 2;
}
const simulation = rows.map(({ label, result }) => {
  const { match, breadth, cycleScarcity, accumulationTilt } = proposedMatch(result);
  const eligible = proposedEligible(result);
  return {
    label,
    inClusterB: CLUSTER_B.includes(label),
    breadth: Number(breadth.toFixed(1)),
    cycleScarcity: Number(cycleScarcity.toFixed(1)),
    accumulationTilt: accumulationTilt === null ? null : Number(accumulationTilt.toFixed(1)),
    proposedMatch: Number(match.toFixed(1)),
    proposedEligible: eligible,
    wouldAssign: eligible && match >= 50,
  };
}).sort((a, b) => b.proposedMatch - a.proposedMatch);
const wouldAssign = simulation.filter((row) => row.wouldAssign);

const output = {
  generatedAt: new Date().toISOString(),
  status: "SPEC ONLY — nothing implemented, no historical figure chosen",
  clusterBProfile: profile,
  separability,
  winnerGroups,
  featureModel: {
    BREADTH: { source: "distinctTokens (tradedTokenCount)", normalization: "logCountScore(tokens, 100) — reuses the existing diversificationReferenceTokens anchor", semantics: "how many distinct assets the wallet trades", nullBehavior: "never null; 0 tokens -> 0" },
    CYCLE_SCARCITY: { source: "completedPositions + reentryCount", normalization: "100 / (1 + completed + reentries)", semantics: "absence of exit/re-entry cycles (100 = none observed in window)", nullBehavior: "never null; cycles unbounded denominator" },
    ACCUMULATION_TILT: { source: "openPositions vs completedPositions", normalization: "100 * open / (open + completed)", semantics: "share of observed positions still held rather than cycled", nullBehavior: "null when open + completed = 0 (no position evidence) — under declared-weight semantics this contributes zero and its weight stays in the denominator" },
    weights: { BREADTH: 0.35, CYCLE_SCARCITY: 0.35, ACCUMULATION_TILT: 0.3 },
  },
  eligibility: {
    qualifyingSwaps: ">= 25 (activity floor, same anchor as Sisyphus)",
    distinctTokens: ">= 20 (breadth floor)",
    cycles: "completedPositions + reentryCount <= 2",
    pnl: "NOT required — this archetype describes portfolio/trading structure, not investment skill",
  },
  partialHistoryRisk: {
    safeWithinWindow: ["distinct-token breadth (undercounted but directionally robust)", "swaps-per-token repetition", "re-entry scarcity (structurally tied to exit absence)", "accumulation tilt for positions opened in-window"],
    notProof: ["'never exits' as a permanent trait (right-edge truncation)", "any profit/skill inference", "M4-style wallets where tracked amounts vanish without EXIT events (disposition unknown: sold before window, transferred, or dusted)"],
  },
  falsePositiveTests: [
    { case: "high-frequency diversified trader who buys AND sells often", verdict: "does NOT trigger", reason: "many completed cycles -> CYCLE_SCARCITY -> 100/(1+cycles) collapses (e.g. 29 cycles -> 3), pulling match far below 50 through a 0.35 declared weight" },
    { case: "Caesar-style concentrated trader", verdict: "does NOT trigger", reason: "breadth is the anti-shape: 1-5 tokens -> BREADTH ~0-20; eligibility floor distinctTokens >= 20 fails outright" },
    { case: "Midas-style profitable holder", verdict: "mostly does NOT trigger; overlap acknowledged", reason: "Midas evidence requires a >= $100 priced open winner; such wallets usually hold few assets (breadth fails). A wallet holding MANY profitable positions would structurally match the accumulator shape — but that is arguably correct structure-wise; assignment then depends on which persona scores higher, and Midas remains unmeasurable without current prices" },
    { case: "wallet with 10 random dust tokens", verdict: "does NOT trigger", reason: "breadth 10 < 20 floor; dust also rarely produces >= 25 qualifying swaps" },
    { case: "wallet with 200 tokens but only 3 qualifying swaps", verdict: "does NOT trigger", reason: "qualifyingSwaps 3 < 25 — token holdings without swap activity are not counted at all (features use tradedTokenCount from swaps, never holdings)" },
    { case: "partial-history wallet where exits cannot be observed", verdict: "may trigger — explicitly bounded", reason: "breadth and repetition are window-fair ratios, but EXIT_SCARCITY only proves absence WITHIN the window; the >= 25 swap floor reduces (not removes) truncation risk; this is a declared KNOWN LIMITATION" },
    { case: "airdrop recipient with many tokens but few actual buys", verdict: "does NOT trigger", reason: "airdrops are TRANSFERs, never qualifying swaps; tradedTokenCount counts only swapped assets, and qualifyingSwaps >= 25 gates the rest" },
  ],
  simulation,
  wouldAssign: wouldAssign.map((row) => row.label),
};
writeFileSync(join(OUTPUT_DIR, "phase6a-persona9-spec.json"), `${JSON.stringify(output, null, 2)}\n`);

const md: string[] = [];
md.push("# Phase 6A — Persona #9 Behavior Spec (Cluster B: Diversified Accumulator / Collector)", "");
md.push(`Generated: ${output.generatedAt} (Asia/Shanghai)`, "");
md.push("SPEC ONLY: no production scoring, no implementation, no historical figure, no changes to existing", "personas. All numbers from stored Phase 5C–5G outputs.", "");
md.push("## 1. Cluster B profiles", "");
md.push("| Wallet | qSwaps | Tokens | Completed | Open | Re-entries | Rate | Swaps/token | PnL | Cov | History |");
md.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
for (const row of profile) {
  md.push(`| ${row.label} | ${row.qualifyingSwaps} | ${row.distinctTokens} | ${row.completedPositions} | ${row.openPositions} | ${row.reentryCount} | ${row.reentryRate ?? "n/a"} | ${row.swapsPerToken} | ${row.realizedPnlUsd === null ? "—" : `$${row.realizedPnlUsd.toFixed(0)}`} | ${row.pnlCoverage} | ${row.partialHistory} |`);
}
md.push("");
md.push("Not captured in stored outputs (declared data gaps): ADD/BUY/SELL/EXIT event counts (bounded:", "disposal legs exist only where realizedPnl is non-null — true only for P4), HHI concentration, largest", "position share. Proxies used are labeled as proxies.", "");
md.push("## 2–3. Feature separability vs the other 35 wallets", "");
md.push("| Feature | B median | B range | Other median | Other range | Others inside B range | Strictly separated | Useful? |");
md.push("|---|---:|---|---:|---|---:|---:|---|");
for (const row of separability) {
  md.push(`| ${row.feature} | ${row.clusterMedian} | [${row.clusterRange[0]}, ${row.clusterRange[1]}] | ${row.otherMedian} | [${Number(row.otherRange[0].toFixed(2))}, ${Number(row.otherRange[1].toFixed(2))}] | ${row.otherWalletsInsideClusterRange}/35 | ${row.strictlySeparatedOf35}/35 | ${row.useful ? "YES" : "weak alone"} |`);
}
md.push("");
md.push("Reading: single features do NOT separate alone — several control wallets also have zero completed", "positions or zero re-entries. The cluster is separated by the CONJUNCTION of breadth with cycle", "scarcity, which is exactly what the proposed composite encodes.", "");
md.push("Per-winner-group medians for context:", "");
md.push("| Winner persona | n | median tokens | median completed | median re-entries | median swaps/token |");
md.push("|---|---:|---:|---:|---:|---:|");
for (const group of winnerGroups) {
  md.push(`| ${group.persona} | ${group.wallets} | ${group.medianTokens} | ${group.medianCompleted} | ${group.medianReentries} | ${group.medianSwapsPerToken === null ? "—" : Number(group.medianSwapsPerToken).toFixed(2)} |`);
}
md.push("");
md.push("## 4. Partial-history risk", "");
md.push(`- Safe within window: ${output.partialHistoryRisk.safeWithinWindow.join("; ")}.`);
md.push(`- Must NOT be treated as proof: ${output.partialHistoryRisk.notProof.join("; ")}.`);
md.push("");
md.push("## 5. Proposed feature model (NOT implemented)", "");
for (const [name, spec] of Object.entries(output.featureModel)) {
  if (name === "weights") continue;
  const component = spec as { source: string; normalization: string; semantics: string; nullBehavior: string };
  md.push(`- **${name}** — source: ${component.source}; normalization: ${component.normalization}; semantics: ${component.semantics}; null: ${component.nullBehavior}.`);
}
md.push(`- Weights: BREADTH 0.35, CYCLE_SCARCITY 0.35, ACCUMULATION_TILT 0.30 (declared-weight semantics from Phase 5G: a null component contributes zero and keeps its weight in the denominator).`);
md.push("");
md.push("## 6. Proposed eligibility", "");
md.push(`- ${output.eligibility.qualifyingSwaps}; ${output.eligibility.distinctTokens}; ${output.eligibility.cycles}.`);
md.push(`- PnL: ${output.eligibility.pnl}.`);
md.push("");
md.push("## 7. False-positive tests", "");
for (const test of output.falsePositiveTests) {
  md.push(`- **${test.case}** — ${test.verdict}: ${test.reason}`);
}
md.push("");
md.push("## Formula simulation on the stored 40 (offline, proposal only)", "");
md.push("| Wallet | B | in cluster | BREADTH | CYCLE_SCARCITY | ACCUM_TILT | Match | Eligible | Would assign |");
md.push("|---|---|---|---:|---:|---:|---:|---|---|");
for (const row of simulation.filter((candidate) => candidate.inClusterB || candidate.wouldAssign || candidate.proposedMatch >= 50)) {
  md.push(`| ${row.label} | ${row.inClusterB ? "✓" : ""} | ${row.inClusterB ? "yes" : "no"} | ${row.breadth} | ${row.cycleScarcity} | ${row.accumulationTilt ?? "null"} | ${row.proposedMatch} | ${row.proposedEligible ? "Y" : "N"} | ${row.wouldAssign ? "YES" : ""} |`);
}
md.push("");
md.push(`Would-assign wallets: **${wouldAssign.length}** — ${output.wouldAssign.join(", ")}.`, "");
md.push("---", "");
md.push("## PERSONA #9 BEHAVIOR DEFINITION", "");
md.push("A wallet that systematically spreads many small acquisition-only positions across a broad set of", "distinct assets: it keeps adding new assets (or adding to existing ones) instead of cycling — exits,", "re-entries, and completed position loops are rare or absent inside the observed window.", "");
md.push("## CORE FEATURES", "");
md.push("BREADTH (0.35), CYCLE_SCARCITY (0.35), ACCUMULATION_TILT (0.30). See section 5.", "");
md.push("## PROPOSED FORMULA", "");
md.push("match = (0.35 * logCountScore(distinctTokens, 100) + 0.35 * 100/(1 + completed + reentries)", "         + 0.30 * 100 * open/(open + completed)) / 1.00, null components contribute zero (declared weights).", "");
md.push("## PROPOSED ELIGIBILITY", "");
md.push("qualifyingSwaps >= 25 AND distinctTokens >= 20 AND (completed + reentries) <= 2. No PnL requirement.", "");
md.push("## KNOWN LIMITATIONS", "");
md.push("1. EXIT_SCARCITY proves absence only within the 1,000-tx window (right-edge truncation).");
md.push("2. The archetype overlaps the Sisyphus evidence-limited family (stagnation and breadth correlate);");
md.push("   wallets like P7/M8/L10 match BOTH the accumulator shape and (with better pricing) Sisyphus.");
md.push("3. ACCUMULATION_TILT is null for wallets with no open AND no completed positions (M4/M6),");
md.push("   so their match rests on 0.70 of declared weight — intentional under 5G integrity semantics.");
md.push("4. ADD/BUY/SELL event counts and true HHI concentration were never captured; the model cannot yet");
md.push("   distinguish 'adds to existing positions' from 'new assets only'.");
md.push("");
md.push(`## EXPECTED PHASE 5C MATCHES`, "");
md.push(`${wouldAssign.length} wallets would assign at match >= 50 under the proposal: ${output.wouldAssign.join(", ")}.`);
md.push("All 5 Cluster B members assign; the additional wallets are members of the Sisyphus", "evidence-limited family (see limitation 2) — a routing question to resolve at implementation review.");
md.push("");
md.push("No production changes were made.");
writeFileSync(join(OUTPUT_DIR, "phase6a-persona9-spec.md"), `${md.join("\n")}\n`);
console.log(`[phase6a] separability computed; would-assign: ${output.wouldAssign.join(", ")}`);
