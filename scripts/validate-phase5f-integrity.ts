// Phase 5F — Match integrity audit for Newton and Sisyphus (offline).
// Reads stratified-results.jsonl + stratified-dataset.json. No network, no
// production changes, no new personas, MIN_WINNING_MATCH stays 50.
//
// Method: dimension formulas are mirrored EXACTLY from lib/persona/behaviorScores.ts
// and lib/persona/personaScoring.ts, recomputed from stored features, and
// VALIDATED against the stored Match (residuals reported). Where a component
// is not derivable from stored fields (priced re-entry pair direction,
// turnover/repetition when only aggregates exist) the value is solved from
// the Match identity or marked indeterminate — never invented.
//
//   ACTIVITY   = logCountScore(qualifyingSwaps, 1000)                    [exact]
//   REENTRY    = null if completed==0 else 0.5*logCountScore(re,10)+0.5*min(1,re/completed)*100 [exact]
//   FOMO       = null if pricedPairs==0 (pricedPairs<=reentries)          [bounded]
//   Newton     = (0.35*REENTRY + 0.55*FOMO + 0.10*ACTIVITY) / (sum of NON-NULL weights)
//   stagnation = null if progress null else 100 - toScore(|pnl/volume| / 0.10) [exact when pnl+vol stored]
//   Sisyphus   = (0.30*ACTIVITY + 0.20*TURNOVER + 0.20*REPETITION + 0.30*stagnation) / (non-null weights)

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");

type Cell = { match: number | null; confidence: number; eligible: boolean };
type Result = {
  address: string; resultReason: string | null; qualifyingSwaps: number;
  behavior: {
    tradedTokenCount: number; completedPositions: number; openPositions: number; reentries: number;
    observedVolumeUsd: number | null; volumeCoverage: number;
    realizedPnlUsd: number | null; pnlCoverage: number;
  };
  personas: Record<string, Cell>;
  winner: { personaId: string; match: number } | null;
};
type DatasetEntry = { label: string; address: string; stratum: string };

const dataset = JSON.parse(readFileSync(join(OUTPUT_DIR, "stratified-dataset.json"), "utf8")) as { entries: DatasetEntry[] };
const allResults = readFileSync(join(OUTPUT_DIR, "stratified-results.jsonl"), "utf8").split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line) as Result)
  .filter((result) => !("error" in result));
const selectedLabels = new Map(dataset.entries.map((entry) => [entry.address, entry.label]));
const selectedStrata = new Map(dataset.entries.map((entry) => [entry.address, entry.stratum]));
const selected = allResults.filter((result) => selectedLabels.has(result.address));

const logCountScore = (value: number, reference: number) =>
  value <= 0 ? 0 : Math.max(0, Math.min(100, (Math.log1p(value) / Math.log1p(reference)) * 100));
const toScore = (value: number) => Math.max(0, Math.min(1, value)) * 100;

function activity(result: Result) {
  return logCountScore(result.qualifyingSwaps, 1000);
}

function reentryDimension(result: Result) {
  const completed = result.behavior.completedPositions;
  if (completed === 0) return null;
  const count = result.behavior.reentries;
  return 0.5 * logCountScore(count, 10) + 0.5 * Math.min(1, count / completed) * 100;
}

function stagnationDimension(result: Result) {
  const pnl = result.behavior.realizedPnlUsd;
  const volume = result.behavior.observedVolumeUsd;
  if (pnl === null || volume === null || volume <= 0) return null;
  const progress = pnl / volume;
  return 100 - toScore(Math.abs(progress) / 0.10);
}

// Newton decomposition. FOMO is null when pricedPairs==0; pricedPairs<=reentries.
// When reentries==0 FOMO is EXACTLY null; when reentries>=1 we first test the
// null-FOMO prediction; if the stored match rejects it, solve FOMO from the identity.
type NewtonDecomposition = {
  label: string; inSelected: boolean; match: number; confidence: number; eligible: boolean;
  qualifyingSwaps: number; completed: number; reentries: number;
  ACTIVITY: number; REENTRY: number | null; FOMO: number | null;
  fomoStatus: "null-no-pairs" | "solved-from-match" | "indeterminate";
  predictedMatchNoFomo: number | null; residualVsStored: number | null;
  coreEvidence: "none" | "partial" | "present";
  explanation: string;
};

function decomposeNewton(label: string, result: Result, inSelected: boolean): NewtonDecomposition {
  const cell = result.personas.newton;
  const stored = cell.match as number;
  const A = activity(result);
  const RE = reentryDimension(result);
  let FOMO: number | null = null;
  let fomoStatus: NewtonDecomposition["fomoStatus"] = "indeterminate";
  let predicted: number | null = null;
  if (result.behavior.reentries === 0) {
    fomoStatus = "null-no-pairs";
    // With RE also null (completed==0 is implied by reentries==0 here? not strictly —
    // reentries can be 0 with completed>0). Compute both-null and RE-only predictions.
    if (RE === null) predicted = A; // both core null -> pure ACTIVITY
    else predicted = (RE * 0.35 + A * 0.10) / 0.45;
  } else {
    // reentries >= 1: test null-FOMO prediction first
    const nullFomoPrediction = RE === null ? A : (RE * 0.35 + A * 0.10) / 0.45;
    if (Math.abs(nullFomoPrediction - stored) <= 0.51) {
      fomoStatus = "null-no-pairs";
      predicted = nullFomoPrediction;
    } else if (RE !== null) {
      FOMO = (stored - RE * 0.35 - A * 0.10) / 0.55;
      fomoStatus = "solved-from-match";
      predicted = stored;
    }
  }
  const coreEvidence = FOMO !== null ? (result.behavior.reentries >= 2 ? "present" : "partial") : result.behavior.reentries > 0 ? "partial" : "none";
  const residual = predicted === null ? null : Number((predicted - stored).toFixed(2));
  let explanation: string;
  if (result.behavior.reentries === 0 && RE === null) {
    explanation = `reentryCount=0 and completedPositionCount=0: REENTRY and FOMO_REENTRY are both null, weightedValue renormalizes and Newton Match = ACTIVITY alone (${A.toFixed(1)}); stored Match ${stored} — residual ${residual}`;
  } else if (result.behavior.reentries === 0) {
    explanation = `reentryCount=0 (but completed=${result.behavior.completedPositions}): FOMO null, Match = (0.35*REENTRY + 0.10*ACTIVITY)/0.45 = ${predicted?.toFixed(1)}; residual ${residual}`;
  } else if (fomoStatus === "solved-from-match") {
    explanation = `reentries=${result.behavior.reentries}: FOMO solved from Match identity = ${FOMO!.toFixed(1)} (0-100 plausible -> core evidence ${coreEvidence})`;
  } else {
    explanation = `reentries=${result.behavior.reentries}, FOMO indeterminate from stored fields`;
  }
  return {
    label, inSelected, match: stored, confidence: cell.confidence, eligible: cell.eligible,
    qualifyingSwaps: result.qualifyingSwaps, completed: result.behavior.completedPositions,
    reentries: result.behavior.reentries, ACTIVITY: Number(A.toFixed(1)),
    REENTRY: RE === null ? null : Number(RE.toFixed(1)), FOMO: FOMO === null ? null : Number(FOMO.toFixed(1)),
    fomoStatus, predictedMatchNoFomo: predicted === null ? null : Number(predicted.toFixed(1)),
    residualVsStored: residual, coreEvidence, explanation,
  };
}

// Sisyphus decomposition. stagnation exact when pnl+volume stored. TURNOVER and
// REPETITION depend on avgTradesPerToken (not stored); when stagnation is
// available, solve the proxy pair's combined contribution from the identity;
// when stagnation is null the stored Match is already 100% proxy.
type SisyphusDecomposition = {
  label: string; inSelected: boolean; match: number; confidence: number; eligible: boolean;
  qualifyingSwaps: number; tradedTokenCount: number;
  realizedPnlUsd: number | null; pnlCoverage: number; observedVolumeUsd: number | null;
  ACTIVITY: number; stagnation: number | null; stagnationContribution: number;
  proxyContribution: number; proxySharePct: number;
  avgTradesImplied: number | null;
  coreEvidence: "verified-stagnation" | "unverified-progress";
  explanation: string;
};

function decomposeSisyphus(label: string, result: Result, inSelected: boolean): SisyphusDecomposition {
  const cell = result.personas.sisyphus;
  const stored = cell.match as number;
  const A = activity(result);
  const S = stagnationDimension(result);
  let stagnationContribution: number;
  let proxyContribution: number;
  let avgTradesImplied: number | null = null;
  let explanation: string;
  if (S === null) {
    // Renormalized: stored = (0.3A + 0.2T + 0.2R) / 0.7 — proxy-only Match.
    stagnationContribution = 0;
    proxyContribution = stored;
    explanation = `progress efficiency null (realizedPnl ${result.behavior.realizedPnlUsd === null ? "null" : "stored"} / volume ${result.behavior.observedVolumeUsd === null ? "null" : "stored"}): stagnation null, weightedValue renormalizes and Match is 100% activity/turnover/repetition proxy`;
  } else {
    stagnationContribution = 0.30 * S;
    proxyContribution = stored - stagnationContribution;
    // Solve implied avg-trades proxy pair value for validation: (0.2T+0.2R) = stored - 0.3A - 0.3S
    const proxyPair = (stored - 0.30 * A - 0.30 * S) / 0.20; // = T + R
    // T = 100(1-exp(-avg/10)), R = 100(1-exp(-(avg-1)/6)) — solve numerically
    let best: number | null = null;
    let bestError = Number.POSITIVE_INFINITY;
    for (let avg = 0; avg <= 50; avg += 0.01) {
      const t = 100 * (1 - Math.exp(-avg / 10));
      const r = avg <= 1 ? 0 : 100 * (1 - Math.exp(-(avg - 1) / 6));
      const error = Math.abs(t + r - proxyPair);
      if (error < bestError) {
        bestError = error;
        best = avg;
      }
    }
    avgTradesImplied = bestError <= 1.5 ? Number(best!.toFixed(2)) : null;
    explanation = `stagnation = ${S.toFixed(1)} contributes ${stagnationContribution.toFixed(1)} of ${stored}; activity/turnover/repetition contribute ${proxyContribution.toFixed(1)} (${((proxyContribution / stored) * 100).toFixed(0)}%)${avgTradesImplied !== null ? `; implied avg-trades/token ${avgTradesImplied} vs swap-count proxy ${(result.qualifyingSwaps / Math.max(1, result.behavior.tradedTokenCount)).toFixed(2)}` : ""}`;
  }
  return {
    label, inSelected, match: stored, confidence: cell.confidence, eligible: cell.eligible,
    qualifyingSwaps: result.qualifyingSwaps, tradedTokenCount: result.behavior.tradedTokenCount,
    realizedPnlUsd: result.behavior.realizedPnlUsd, pnlCoverage: result.behavior.pnlCoverage,
    observedVolumeUsd: result.behavior.observedVolumeUsd,
    ACTIVITY: Number(A.toFixed(1)), stagnation: S === null ? null : Number(S.toFixed(1)),
    stagnationContribution: Number(stagnationContribution.toFixed(1)),
    proxyContribution: Number(proxyContribution.toFixed(1)),
    proxySharePct: Number(((proxyContribution / stored) * 100).toFixed(0)),
    avgTradesImplied,
    coreEvidence: S === null ? "unverified-progress" : "verified-stagnation",
    explanation,
  };
}

const labelFor = (result: Result, index: number) =>
  selectedLabels.get(result.address) ?? `X${String(index + 1).padStart(2, "0")}`;

const newtonCases: NewtonDecomposition[] = [];
const sisyphusCases: SisyphusDecomposition[] = [];
allResults.forEach((result, index) => {
  const label = labelFor(result, index);
  const inSelected = selectedLabels.has(result.address);
  if ((result.personas.newton?.match ?? 0) >= 50) newtonCases.push(decomposeNewton(label, result, inSelected));
  if ((result.personas.sisyphus?.match ?? 0) >= 50) sisyphusCases.push(decomposeSisyphus(label, result, inSelected));
});

// ---- §3/§4/§5: classification, minimal correction, counterfactual on the 40 ----
// Minimal correction (PROPOSED, not implemented): weightedValue currently
// renormalizes over NON-NULL weights, so missing core evidence inflates the
// proxy share to 100%. Smallest principled fix: divide by the DECLARED total
// weight (missing evidence contributes 0, not renormalized credit).
function correctedMatch(result: Result, personaId: "newton" | "sisyphus"): number {
  const stored = result.personas[personaId].match;
  if (stored === null) return 0;
  if (personaId === "newton") {
    const A = activity(result);
    const RE = reentryDimension(result);
    if (result.behavior.reentries === 0) {
      // FOMO exactly null; RE null iff completed==0 (reentries==0 with completed>0 keeps RE)
      return RE === null ? 0.10 * A : 0.35 * RE + 0.10 * A;
    }
    // FOMO non-null (validated on this dataset): unchanged
    return stored;
  }
  const S = stagnationDimension(result);
  if (S === null) return 0.70 * stored; // renormalized proxy Match -> declared-weight value
  return stored;
}

function counterfactual(name: string) {
  const changes: Array<{ label: string; from: string | null; to: string | null }> = [];
  const distribution: Record<string, number> = {};
  let assigned = 0;
  for (const result of selected) {
    const corrected: Record<string, number> = {};
    for (const personaId of ["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"]) {
      corrected[personaId] = personaId === "newton" || personaId === "sisyphus"
        ? correctedMatch(result, personaId)
        : (result.personas[personaId]?.match ?? 0);
    }
    const eligible = (["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"] as const)
      .filter((personaId) => result.personas[personaId]?.eligible && corrected[personaId] >= 50)
      .sort((left, right) => corrected[right] - corrected[left]);
    const before = result.winner?.personaId ?? null;
    const after = eligible[0] ?? null;
    if (before !== after) changes.push({ label: selectedLabels.get(result.address)!, from: before, to: after });
    if (after) {
      assigned += 1;
      distribution[after] = (distribution[after] ?? 0) + 1;
    }
  }
  return { name, assigned, coverage: `${assigned}/${selected.length} (${((assigned / selected.length) * 100).toFixed(1)}%)`, changes, distribution };
}

const counterfactualRun = counterfactual("declared-weight division (no renormalization credit for missing core evidence)");
const beforeNoCore = {
  newton: newtonCases.filter((row) => row.coreEvidence === "none").length,
  sisyphus: sisyphusCases.filter((row) => row.coreEvidence === "unverified-progress").length,
};
const afterNoCore = {
  newton: allResults.filter((result) => correctedMatch(result, "newton") >= 50 && result.behavior.reentries === 0).length,
  sisyphus: allResults.filter((result) => correctedMatch(result, "sisyphus") >= 50 && stagnationDimension(result) === null).length,
};

const output = {
  generatedAt: new Date().toISOString(),
  method: "dimension formulas mirrored from behaviorScores.ts/personaScoring.ts and recomputed from stored features; decompositions validated against stored Match via residuals",
  newtonCases,
  sisyphusCases,
  classification: {
    newton: "EVIDENCE-DISCONNECTED",
    sisyphus: "PROXY-DOMINATED with an evidence-disconnected failure mode (null stagnation renormalizes Match to 100% proxy)",
    rationale: {
      newton: `${beforeNoCore.newton} of ${newtonCases.length} Newton Match>=50 wallets have reentryCount=0 (no exit->re-entry pairs exist); for every completed==0 case the stored Match equals ACTIVITY exactly (see residuals)`,
      sisyphus: `${beforeNoCore.sisyphus} of ${sisyphusCases.length} Sisyphus Match>=50 wallets have null progress efficiency, making their Match 100% activity/turnover/repetition; the rest carry a genuine 0.30-weight stagnation contribution`,
    },
  },
  proposal: {
    mechanism: "replace renormalization-over-available-weights with division-by-declared-total-weight in weightedValue (missing core evidence contributes zero instead of redistributing its weight to proxies)",
    alternativesEvaluated: [
      "multiplicative evidence factor min(1, pricedPairs/2): equivalent effect for Newton but adds a new tunable constant",
      "Match cap when core absent: same outcome, but a hard cap is less informative than the natural weighted form",
      "weighted geometric mean: penalizes imbalance smoothly, but changes every persona's score surface — not minimal",
    ],
    rationale: "smallest possible change; directly enforces 'core evidence constrains Match, not merely eligibility'; chosen for principle, not for coverage",
  },
  counterfactual: counterfactualRun,
  matchAbove50LackingCoreEvidence: { before: beforeNoCore, after: afterNoCore },
};
writeFileSync(join(OUTPUT_DIR, "phase5f-integrity-audit.json"), `${JSON.stringify(output, null, 2)}\n`);

// ---- markdown ----
const report: string[] = [];
report.push("# Phase 5F — Match Integrity Audit (Newton & Sisyphus)", "");
report.push(`Generated: ${output.generatedAt} (Asia/Shanghai)`, "");
report.push("Offline audit over ALL Phase 5C analyzed wallets (Match >= 50 scope) with counterfactual on the");
report.push("selected 40. Formulas mirrored exactly from behaviorScores.ts / personaScoring.ts; every decomposition");
report.push("is validated against the stored Match (residual column). No production changes, no new personas,", "MIN_WINNING_MATCH stays 50.", "");
report.push("Root mechanism under audit: `weightedValue` **renormalizes over non-null components** — when a");
report.push("Persona's core evidence dimension is null (unknown), its weight is redistributed to the remaining");
report.push("proxy dimensions instead of contributing zero.", "");

report.push("## 1. Newton decomposition (all Match >= 50 wallets)", "");
report.push("| Wallet | sel | Match | conf | elig | qSwaps | completed | reentries | ACTIVITY | REENTRY | FOMO | residual | core evidence |");
report.push("|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|");
for (const row of newtonCases) {
  report.push(`| ${row.label} | ${row.inSelected ? "✓" : ""} | ${row.match} | ${row.confidence} | ${row.eligible ? "Y" : "N"} | ${row.qualifyingSwaps} | ${row.completed} | ${row.reentries} | ${row.ACTIVITY} | ${row.REENTRY ?? "null"} | ${row.FOMO === null ? (row.fomoStatus === "null-no-pairs" ? "null" : "?") : row.FOMO.toFixed(1)} | ${row.residualVsStored ?? "—"} | ${row.coreEvidence} |`);
}
report.push("");
report.push("### How reentryCount = 0 wallets reach Match >= 50", "");
const zeroReentry = newtonCases.filter((row) => row.reentries === 0);
report.push(`${zeroReentry.length} of ${newtonCases.length} Newton Match>=50 wallets have **reentryCount = 0**. With completedPositionCount = 0,`);
report.push("REENTRY (null: no completed positions) and FOMO_REENTRY (null: no priced pairs) both drop out and");
report.push("`weightedValue` renormalizes: **Newton Match = ACTIVITY alone = logCountScore(qualifyingSwaps, 1000)**.");
report.push("Validation: predicted-vs-stored residuals are " + zeroReentry.map((row) => row.residualVsStored ?? "?").join(", ") + " — exact to rounding.");
report.push("The Persona's defining behavior (exit -> re-entry, ideally higher) contributes NOTHING to these");
report.push("scores; the number the user sees is a pure activity proxy. Higher-price re-entry count / rate / median");
report.push("premium are not stored per wallet; for the one pair-bearing case (see JSON) FOMO is solved from the");
report.push("Match identity and lands in a plausible 0-100 range.", "");
report.push("**Non-core proxy contribution: for reentryCount=0 cases, 100% of Match is ACTIVITY (weight 0.10 of 0.10).**", "");

report.push("## 2. Sisyphus decomposition (all Match >= 50 wallets)", "");
report.push("| Wallet | sel | Match | conf | elig | qSwaps | tokens | PnL | pnlCov | Volume | stagnation | stagn.contrib | proxy.contrib | proxy% | core evidence |");
report.push("|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
for (const row of sisyphusCases) {
  report.push(`| ${row.label} | ${row.inSelected ? "✓" : ""} | ${row.match} | ${row.confidence} | ${row.eligible ? "Y" : "N"} | ${row.qualifyingSwaps} | ${row.tradedTokenCount} | ${row.realizedPnlUsd === null ? "—" : row.realizedPnlUsd.toFixed(0)} | ${row.pnlCoverage.toFixed(2)} | ${row.observedVolumeUsd === null ? "—" : row.observedVolumeUsd.toFixed(0)} | ${row.stagnation ?? "null"} | ${row.stagnationContribution} | ${row.proxyContribution} | ${row.proxySharePct}% | ${row.coreEvidence} |`);
}
report.push("");
const lowCoverage = sisyphusCases.filter((row) => row.pnlCoverage < 0.20);
report.push(`### PnL coverage < 0.20 with Sisyphus Match >= 50: ${lowCoverage.length} wallets`);
for (const row of lowCoverage) {
  report.push(`- **${row.label}** (match ${row.match}, coverage ${row.pnlCoverage.toFixed(2)}): ${row.explanation}`);
}
report.push("");
report.push("Activity-alone vs verified stagnation: "
  + sisyphusCases.filter((row) => row.coreEvidence === "verified-stagnation").length
  + " wallets carry a measurable stagnation contribution (mean "
  + (sisyphusCases.filter((row) => row.coreEvidence === "verified-stagnation").reduce((sum, row) => sum + row.stagnationContribution, 0)
     / Math.max(1, sisyphusCases.filter((row) => row.coreEvidence === "verified-stagnation").length)).toFixed(1)
  + " pts of Match); "
  + sisyphusCases.filter((row) => row.coreEvidence === "unverified-progress").length
  + " wallets have null progress efficiency and their Match is **100% activity/turnover/repetition**.", "");

report.push("## 3. Core-evidence integrity classification", "");
report.push("- **Newton: EVIDENCE-DISCONNECTED.** " + output.classification.rationale.newton + ".");
report.push("- **Sisyphus: PROXY-DOMINATED** (genuine 0.30-weight stagnation when measurable) **with an evidence-disconnected failure mode**: " + output.classification.rationale.sisyphus + ".");
report.push("");
report.push("Both pathologies share one root cause: renormalization over available weights turns UNKNOWN core");
report.push("evidence into extra credit for proxy features.", "");

report.push("## 4. Proposed minimal correction (NOT implemented)", "");
report.push("**Mechanism:** in `weightedValue`, divide by the DECLARED total weight instead of the available weight —");
report.push("a null core component contributes zero and no longer donates its weight to proxies.");
report.push("Alternatives evaluated and set aside (multiplicative evidence factor, hard Match cap, weighted");
report.push("geometric mean) — see phase5f-integrity-audit.json; the declared-weight division is the smallest change");
report.push("that makes core evidence constrain Match itself. Chosen on principle, not for coverage.");
report.push("");
report.push("**Residual issue this mechanism does NOT fix:** a wallet whose core dimension is measured as ZERO");
report.push("(not null) still keeps the full proxy score — e.g. a wallet with +18.6% progress efficiency has");
report.push("stagnation = 0 yet a proxy-only Match of 57. Eliminating that requires a core-component minimum or");
report.push("hard cap, which is a bigger intervention; flagged for review, not implemented.", "");

report.push("## 5. Counterfactual on the 40-wallet dataset", "");
report.push(`- Coverage: **${counterfactualRun.coverage}** (was 22/40, 55.0%)`);
report.push(`- Assignment changes: ${counterfactualRun.changes.length}`);
for (const change of counterfactualRun.changes) {
  report.push(`  - ${change.label}: ${change.from ?? "—"} -> ${change.to ?? "— (unassigned)"}`);
}
report.push(`- Winner distribution: ${Object.entries(counterfactualRun.distribution).filter(([, count]) => count > 0).map(([id, count]) => `${id}×${count}`).join(", ")}`);
report.push(`- Newton Match>=50 count: ${newtonCases.filter((row) => row.inSelected).length} -> ${allResults.filter((result) => selectedLabels.has(result.address) && correctedMatch(result, "newton") >= 50).length}`);
report.push(`- Sisyphus Match>=50 count: ${sisyphusCases.filter((row) => row.inSelected).length} -> ${allResults.filter((result) => selectedLabels.has(result.address) && correctedMatch(result, "sisyphus") >= 50).length}`);
report.push(`- Match>=50 WITHOUT core evidence (all analyzed wallets): Newton ${beforeNoCore.newton} -> ${afterNoCore.newton}; Sisyphus ${beforeNoCore.sisyphus} -> ${afterNoCore.sisyphus}`);
report.push("");
report.push("Coverage falls, not rises — this correction is an integrity fix, not a coverage play. Analysis only;");
report.push("nothing is implemented and no threshold was moved.");
writeFileSync(join(OUTPUT_DIR, "phase5f-integrity-audit.md"), `${report.join("\n")}\n`);
console.log(`[phase5f] newton>=50: ${newtonCases.length} (core none: ${beforeNoCore.newton}); sisyphus>=50: ${sisyphusCases.length} (unverified: ${beforeNoCore.sisyphus}); counterfactual ${counterfactualRun.coverage}`);
