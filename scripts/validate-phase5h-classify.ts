// Phase 5H — true persona gap classification (offline, stored data only).
// Classifies the 18 post-5G NO_STRONG_MATCH wallets into EVIDENCE_LIMITED /
// TRUE_PERSONA_GAP / WEAK_OR_MIXED, clusters the true gaps by behavior, and
// produces the coverage decomposition plus the Persona #9 recommendation.
// No scoring/eligibility/threshold changes, no network, no new personas.
//
// Inputs: phase5g-results.jsonl (post-fix scores), stratified-results.jsonl
// (5C episode evidence: icarus candidates, DQ strongest), stratified-dataset.json.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");
const PERSONA_IDS = ["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"] as const;

type Result = {
  address: string; resultReason: string | null; qualifyingSwaps: number;
  behavior: {
    tradedTokenCount: number; completedPositions: number; openPositions: number; reentries: number;
    observedVolumeUsd: number | null; volumeCoverage: number;
    realizedPnlUsd: number | null; pnlCoverage: number;
  };
  personas: Record<string, { match: number | null; confidence: number; eligible: boolean }>;
  winner: { personaId: string; match: number } | null;
  icarus: { eligibleEpisodes: number; pricedEpisodes: number };
  donQuixoteStrongest: { returnPct: number | null; days: number | null; match: number | null } | null;
};
type DatasetEntry = { label: string; address: string; stratum: string };

const dataset = JSON.parse(readFileSync(join(OUTPUT_DIR, "stratified-dataset.json"), "utf8")) as { entries: DatasetEntry[] };
const g5 = new Map(readFileSync(join(OUTPUT_DIR, "phase5g-results.jsonl"), "utf8").split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as Result).filter((row) => !("error" in row) && row.resultReason !== undefined)
  .map((row) => [row.address, row]));
const c5 = new Map(readFileSync(join(OUTPUT_DIR, "stratified-results.jsonl"), "utf8").split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as Result).filter((row) => !("error" in row))
  .map((row) => [row.address, row]));

type Classification = {
  label: string; stratum: string;
  category: "EVIDENCE_LIMITED" | "TRUE_PERSONA_GAP" | "WEAK_OR_MIXED";
  qualifyingSwaps: number; realizedPnlUsd: number | null; pnlCoverage: number;
  completedPositions: number; openPositions: number; reentryCount: number;
  turnoverProxy: string; concentrationProxy: string;
  topPersona: string; topMatch: number | null; topEligible: boolean;
  failureReason: string; classification: string; summary: string;
  evidenceDetail?: { resembles: string; missing: string; source: string; wouldCover: "YES" | "MAYBE" | "NO" };
  cluster?: string;
};

// Classifications below are analytic judgments over the stored dossiers; every
// number cited is read from phase5g/stratified results at report time.
const DECISIONS: Record<string, Omit<Classification, "label" | "stratum" | "qualifyingSwaps" | "realizedPnlUsd" | "pnlCoverage" | "completedPositions" | "openPositions" | "reentryCount" | "turnoverProxy" | "concentrationProxy" | "topPersona" | "topMatch" | "topEligible">> = {
  P8: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 86 (stagnation 99.7 measured) but realizedPnl coverage 0.04 < 0.5 gate",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE)",
    summary: "Very active grinder (151 swaps, 13 tokens) whose economic stagnation is measured and extreme; only the valuation coverage of completed exits is missing.",
    evidenceDetail: { resembles: "Sisyphus", missing: "USD valuation on completed exits (PnL coverage 0.04 vs 0.5)", source: "PRICE_COVERAGE", wouldCover: "YES" },
  },
  L10: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 61 but realizedPnl coverage 0.32 < 0.5",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE)",
    summary: "Active loser (-$18.6 on $6.3k volume, 24 tokens) with measured stagnation; exits exist but are under-valued.",
    evidenceDetail: { resembles: "Sisyphus", missing: "USD valuation on the single completed exit and partial sells", source: "PRICE_COVERAGE", wouldCover: "YES" },
  },
  M8: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 59 but realizedPnl coverage 0.08 < 0.5",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE)",
    summary: "Flat grinder ($0.00 realized on $65 volume, 35 tokens, 20 open) — signal present, coverage missing.",
    evidenceDetail: { resembles: "Sisyphus", missing: "Priced completed disposals (1 completed position)", source: "PRICE_COVERAGE", wouldCover: "YES" },
  },
  M3: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 56 but realizedPnl coverage 0.30 < 0.5",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE)",
    summary: "Small-scale grinder ($0.64 on $212 volume); Caesar@50 winner lost to live drift between runs.",
    evidenceDetail: { resembles: "Sisyphus", missing: "Valuation coverage of partial sells (0 completed positions)", source: "PRICE_COVERAGE", wouldCover: "YES" },
  },
  P5: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 54 but realizedPnl coverage 0.05 < 0.5",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE)",
    summary: "Buyer of 17 tokens with small realized profit ($44) from partials; stagnation signal measurable, exits unvalued.",
    evidenceDetail: { resembles: "Sisyphus", missing: "Valuation of the 2 completed-partial episodes", source: "PRICE_COVERAGE", wouldCover: "YES" },
  },
  P9: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 54 but realizedPnl coverage 0.08 < 0.5",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE)",
    summary: "Diversified sampler (19 tokens, 12 open, $0.72 realized) — thin but present stagnation evidence.",
    evidenceDetail: { resembles: "Sisyphus", missing: "Priced disposals (0 completed positions)", source: "PRICE_COVERAGE", wouldCover: "YES" },
  },
  P7: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 52 but realizedPnl coverage 0.10 < 0.5",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE)",
    summary: "Borderline grinder (37 tokens, $1.1 realized on $1.5k volume); match sits just above the assignment floor.",
    evidenceDetail: { resembles: "Sisyphus", missing: "Valuation of completed exits", source: "PRICE_COVERAGE", wouldCover: "MAYBE" },
  },
  L7: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Sisyphus Match 57 but qualifyingSwaps 23 < 25 AND realizedPnl coverage 0.30 < 0.5",
    classification: "EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE + one-swap count near-miss)",
    summary: "Profitable small trader ($21 on $9.5k) with measured stagnation; blocked by coverage and exactly one swap under the activity minimum.",
    evidenceDetail: { resembles: "Sisyphus", missing: "Exit valuation; swap-count window (23/25 under a 1,000-tx cap)", source: "PRICE_COVERAGE + PARTIAL_HISTORY", wouldCover: "MAYBE" },
  },
  L1: {
    category: "EVIDENCE_LIMITED",
    failureReason: "Newton Match 60 but reentryCount 1 < 2 (single exit->re-entry pair, priced, strongly higher)",
    classification: "EVIDENCE_LIMITED (Newton / PARTIAL_HISTORY)",
    summary: "Losing trader (-$890, 0.57 coverage) with ONE textbook higher-price re-entry; a second pair would complete Newton's evidence.",
    evidenceDetail: { resembles: "Newton", missing: "A second exit->re-entry pair (only 1 observed in the capped window)", source: "PARTIAL_HISTORY", wouldCover: "MAYBE" },
  },
  P1: {
    category: "TRUE_PERSONA_GAP",
    failureReason: "Best fits are Sisyphus@44 / Newton@36 — both semantically wrong for a consistently profitable, low-FOMO, diversified trader",
    classification: "TRUE_PERSONA_GAP — cluster A (profitable disciplined realization)",
    summary: "Profitable trader with disciplined exits: +$1,769 realized at 0.78 coverage, 36 completed positions, re-entry rate 0.08, 93 tokens, no severe loser, no concentration.",
    cluster: "A",
  },
  P3: {
    category: "TRUE_PERSONA_GAP",
    failureReason: "Sisyphus@34 top — but the wallet takes profits (+$89 realized); no persona rewards disciplined realization",
    classification: "TRUE_PERSONA_GAP — cluster A (profitable disciplined realization, small scale)",
    summary: "Small-scale disciplined realizer: +$89 at 0.12 coverage, 3 completed exits, zero re-entries, 30 tokens.",
    cluster: "A",
  },
  T9: {
    category: "TRUE_PERSONA_GAP",
    failureReason: "All matches <27 post-fix; systematic accumulation has no archetype (Caesar=concentration, Sisyphus=grind cycles, DQ=severe loss held)",
    classification: "TRUE_PERSONA_GAP — cluster B (diversified accumulator)",
    summary: "Extreme diversified accumulator: 269 swaps across 259 tokens, zero completed positions, zero re-entries, $0.21 realized.",
    cluster: "B",
  },
  M4: {
    category: "TRUE_PERSONA_GAP",
    failureReason: "Sisyphus@20; no exits, no re-entries, no concentration — no existing archetype for pure accumulation",
    classification: "TRUE_PERSONA_GAP — cluster B (diversified accumulator)",
    summary: "Pure buy-only collector: 56 swaps, 53 tokens, no sells at all, $37 volume.",
    cluster: "B",
  },
  M5: {
    category: "TRUE_PERSONA_GAP",
    failureReason: "Sisyphus@26; identical shape — accumulation without disposal",
    classification: "TRUE_PERSONA_GAP — cluster B (diversified accumulator)",
    summary: "Buy-only collector: 64 swaps, 30 tokens, 1 open position, no disposals.",
    cluster: "B",
  },
  M6: {
    category: "TRUE_PERSONA_GAP",
    failureReason: "Sisyphus@32; accumulation shape, nothing priced to grind",
    classification: "TRUE_PERSONA_GAP — cluster B (diversified accumulator)",
    summary: "Buy-only collector: 107 swaps, 33 tokens, $5.8k volume, no disposals.",
    cluster: "B",
  },
  P4: {
    category: "TRUE_PERSONA_GAP",
    failureReason: "Sisyphus@48 (ineligible AND semantically wrong: +$88 realized profit); no persona fits buy-and-partially-harvest behavior",
    classification: "TRUE_PERSONA_GAP — cluster B (diversified accumulator / partial sampler)",
    summary: "Diversified sampler: 121 swaps, 67 tokens, zero completed exits, small realized profits ($88) from partial sells only.",
    cluster: "B",
  },
  L9: {
    category: "WEAK_OR_MIXED",
    failureReason: "Icarus@46 (peaks only +6.3%/+3.1% — far under the +100% archetype), Sisyphus@41; nothing distinctive",
    classification: "WEAK_OR_MIXED",
    summary: "Small churning loser (-$22 on $712 volume): moderate activity, moderate loss, peaks too small for Icarus, no coherent pattern.",
  },
  M7: {
    category: "WEAK_OR_MIXED",
    failureReason: "Caesar@47 (diversified across 40 tokens — concentration is semantically wrong); everything else <31",
    classification: "WEAK_OR_MIXED",
    summary: "Moderately active, diversified, PnL unmeasurable (0 priced episodes): no distinctive repeated pattern.",
  },
};

const rows: Classification[] = [];
for (const entry of dataset.entries) {
  const after = g5.get(entry.address);
  if (!after || after.resultReason !== "NO_STRONG_MATCH") continue;
  const decision = DECISIONS[entry.label];
  if (!decision) throw new Error(`missing classification decision for ${entry.label}`);
  const ranked = PERSONA_IDS
    .map((personaId) => ({ personaId, cell: after.personas[personaId] }))
    .filter((row) => row.cell && row.cell.match !== null)
    .sort((left, right) => (right.cell.match as number) - (left.cell.match as number));
  rows.push({
    label: entry.label, stratum: entry.stratum,
    ...decision,
    qualifyingSwaps: after.qualifyingSwaps,
    realizedPnlUsd: after.behavior.realizedPnlUsd,
    pnlCoverage: Number(after.behavior.pnlCoverage.toFixed(2)),
    completedPositions: after.behavior.completedPositions,
    openPositions: after.behavior.openPositions,
    reentryCount: after.behavior.reentries,
    turnoverProxy: `${after.qualifyingSwaps} swaps / ${after.behavior.tradedTokenCount} tokens (turnover/concentration scores not captured; proxies)`,
    concentrationProxy: `tokenCount=${after.behavior.tradedTokenCount} diversification proxy`,
    topPersona: ranked[0]?.personaId ?? "—",
    topMatch: ranked[0]?.cell.match ?? null,
    topEligible: ranked[0]?.cell.eligible ?? false,
  });
}
if (rows.length !== 18) throw new Error(`expected 18 NSM wallets, got ${rows.length}`);

const counts = {
  assigned: 40 - rows.length,
  evidenceLimited: rows.filter((row) => row.category === "EVIDENCE_LIMITED").length,
  truePersonaGap: rows.filter((row) => row.category === "TRUE_PERSONA_GAP").length,
  weakOrMixed: rows.filter((row) => row.category === "WEAK_OR_MIXED").length,
};
const clusters = {
  A: {
    name: "Cluster A — profitable disciplined realization",
    wallets: rows.filter((row) => row.cluster === "A").map((row) => row.label),
    shared: "consistent realized profit, multiple completed exits, near-zero re-entry (no FOMO), diversified, no severe long-held loser, no concentration",
    metrics: "P1: +$1,769 @ 0.78 PnL coverage, 36 exits, re-entry rate 0.08; P3: +$89 @ 0.12 coverage, 3 exits, 0 re-entries",
    whyNoneFit: "Sisyphus rewards stagnation (these wallets progress), Midas rewards UNREALIZED holdings (these realize), Newton/Icarus require re-entry/giveback (absent by discipline), Caesar/Croesus require concentration/size (absent by diversification), DQ/Napoleon require losses (absent)",
    missingConcept: "a persona for taking profits well: frequent meaningful realized gains, low higher-price re-entry, limited giveback, not dependent on concentration",
  },
  B: {
    name: "Cluster B — diversified accumulator / many-bet sampler",
    wallets: rows.filter((row) => row.cluster === "B").map((row) => row.label),
    shared: "systematic diversified buying (17-259 tokens), zero completed exit cycles, zero re-entries, no concentration in any single asset",
    metrics: "T9: 259 tokens/0 exits; M4/M5/M6: buy-only, no sells; P4: partial-profit harvesting without full exits (+$88 realized)",
    whyNoneFit: "Caesar is the anti-shape (single-bag concentration), Sisyphus needs grind-to-zero cycles (no exits exist), Midas needs profitable open holdings with current value (unpriced), Newton/DQ/Icarus need exit behavior that never occurs",
    missingConcept: "a persona for spread-many-bets accumulation: many small diversified positions, patient holding, no disposal discipline implied",
    caveat: "partial-history caveat: with a 1,000-tx cap, 'never exits' is observed only within the window; longer histories could reveal disposal",
  },
};
const theoretical = counts.assigned + clusters.A.wallets.length + clusters.B.wallets.length;

const output = {
  generatedAt: new Date().toISOString(),
  scope: "18 NO_STRONG_MATCH wallets remaining after the Phase 5G integrity fix",
  rows,
  counts,
  coverage: {
    current: `${counts.assigned}/40 (${(counts.assigned / 40 * 100).toFixed(1)}%)`,
    theoretical: `${theoretical}/40 (${(theoretical / 40 * 100).toFixed(1)}%)`,
  },
  clusters,
  persona9Recommendation: {
    decision: "YES",
    archetype1: "Disciplined profitable exit trader: frequently realizes meaningful profits, low higher-price re-entry, limited giveback, diversified rather than concentrated.",
    archetype1Coverage: { wallets: clusters.A.wallets.length, percent: (clusters.A.wallets.length / 40 * 100).toFixed(1), strongestExample: "P1" },
    secondArchetypeSupported: "YES",
    archetype2: "Diversified accumulator / many-bet sampler: systematic spread of small positions, no exit cycles, no re-entry, no concentration.",
    archetype2Coverage: { wallets: clusters.B.wallets.length, percent: (clusters.B.wallets.length / 40 * 100).toFixed(1), strongestExample: "T9" },
    caution: "Cluster B rests on absence-of-exit evidence inside a capped window; Cluster A is only 2 wallets. Neither is named, nothing is implemented.",
  },
};
writeFileSync(join(OUTPUT_DIR, "phase5h-gap-classification.json"), `${JSON.stringify(output, null, 2)}\n`);

const md: string[] = [];
md.push("# Phase 5H — True Persona Gap Classification", "");
md.push(`Generated: ${output.generatedAt} (Asia/Shanghai)`, "");
md.push("Offline classification of the 18 NO_STRONG_MATCH wallets remaining after the Phase 5G integrity");
md.push("fix, using stored Phase 5C–5G data only. No scoring, eligibility, threshold, or persona changes;", "no network calls; nothing implemented.", "");
md.push("## 1–2. Wallet-by-wallet classification", "");
md.push("| Wallet | qSwaps | Realized PnL | PnL cov | Completed | Open | Re-entries | Top persona | Match | Elig? | Classification |");
md.push("|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|");
for (const row of rows) {
  md.push(`| ${row.label} | ${row.qualifyingSwaps} | ${row.realizedPnlUsd === null ? "—" : `$${row.realizedPnlUsd.toFixed(0)}`} | ${row.pnlCoverage} | ${row.completedPositions} | ${row.openPositions} | ${row.reentryCount} | ${row.topPersona} | ${row.topMatch ?? "—"} | ${row.topEligible ? "Y" : "N"} | ${row.classification} |`);
}
md.push("");
for (const row of rows) {
  md.push(`### ${row.label} [${row.stratum}] — ${row.category}`);
  md.push(`- Failure reason: ${row.failureReason}`);
  md.push(`- Summary: ${row.summary}`);
  if (row.evidenceDetail) {
    md.push(`- Evidence detail: resembles **${row.evidenceDetail.resembles}**; missing: ${row.evidenceDetail.missing} (${row.evidenceDetail.source}); would-cover if available: **${row.evidenceDetail.wouldCover}**`);
  }
  md.push("");
}
md.push("Turnover/concentration scores were never captured in 5C–5G outputs; swaps-per-token and token counts serve as labeled proxies.", "");
md.push("## 3. Evidence-limited breakdown", "");
md.push("| Wallet | Resembles | Missing evidence | Source | Would cover? |");
md.push("|---|---|---|---|---|");
for (const row of rows.filter((row) => row.category === "EVIDENCE_LIMITED")) {
  const detail = row.evidenceDetail!;
  md.push(`| ${row.label} | ${detail.resembles} | ${detail.missing} | ${detail.source} | ${detail.wouldCover} |`);
}
md.push("");
md.push("7 of 9 are the Phase 5E Sisyphus PRICE_COVERAGE family (matches 52-86 already above 50); the other two are Newton (L1, needs a second re-entry pair) and the combined-cause L7. No gate loosening is suggested.", "");
md.push("## 4. True-gap behavior clusters", "");
for (const cluster of [clusters.A, clusters.B]) {
  md.push(`### ${cluster.name}`);
  md.push(`- Wallets: ${cluster.wallets.join(", ")} (n=${cluster.wallets.length})`);
  md.push(`- Shared behavior: ${cluster.shared}`);
  md.push(`- Key metrics: ${cluster.metrics}`);
  md.push(`- Why none of the 8 fit: ${cluster.whyNoneFit}`);
  md.push(`- Missing behavioral concept: ${cluster.missingConcept}`);
  if ("caveat" in cluster && cluster.caveat) md.push(`- Caveat: ${cluster.caveat}`);
  md.push("");
}
md.push("## 5. Weak / mixed", "");
md.push("L9 and M7: enough observable behavior, no coherent repeated pattern. Explicitly left as NO_STRONG_MATCH —", "a persona must represent a recognizable pattern, not fill every wallet.", "");
md.push("## 6. Coverage decomposition", "");
md.push("| Bucket | Wallets |");
md.push("|---|---:|");
md.push(`| Assigned | ${counts.assigned} |`);
md.push(`| Evidence limited | ${counts.evidenceLimited} |`);
md.push(`| True persona gap | ${counts.truePersonaGap} |`);
md.push(`| Weak / mixed | ${counts.weakOrMixed} |`);
md.push(`| Total | 40 |`);
md.push("");
md.push(`- CURRENT assignment coverage: **${output.coverage.current}**`);
md.push(`- THEORETICAL persona coverage (assigned + coherent gap clusters, evidence-limited excluded): **${output.coverage.theoretical}**`, "");
md.push("## 7. Persona expansion decision", "");
md.push("**Do we have evidence for adding Persona #9? YES** — and a second archetype is also supported.", "");
md.push(`1. **${output.persona9Recommendation.archetype1}** — plausibly covers ${output.persona9Recommendation.archetype1Coverage.wallets} wallets (${output.persona9Recommendation.archetype1Coverage.percent}% of the 40); strongest example ${output.persona9Recommendation.archetype1Coverage.strongestExample}.`);
md.push(`2. **${output.persona9Recommendation.archetype2}** — plausibly covers ${output.persona9Recommendation.archetype2Coverage.wallets} wallets (${output.persona9Recommendation.archetype2Coverage.percent}%); strongest example ${output.persona9Recommendation.archetype2Coverage.strongestExample}.`);
md.push("");
md.push(`Caution: ${output.persona9Recommendation.caution}`);
md.push("");
md.push("No historical figure selected; no scoring, threshold, or eligibility change; analysis only.");
writeFileSync(join(OUTPUT_DIR, "phase5h-gap-classification.md"), `${md.join("\n")}\n`);
console.log(`[phase5h] classified ${rows.length}: EL=${counts.evidenceLimited} TPG=${counts.truePersonaGap} WM=${counts.weakOrMixed}; theoretical coverage ${output.coverage.theoretical}`);
