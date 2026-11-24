// Phase 5 calibration report builder. Reads raw-results.jsonl (+ dataset.json)
// and writes raw-results.json, summary.json and phase5-calibration.md.
// Pure aggregation — no pipeline or formula changes.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");
const PERSONAS = ["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"] as const;
type PersonaId = (typeof PERSONAS)[number];
const PERSONA_NAMES: Record<PersonaId, string> = {
  sisyphus: "Sisyphus", newton: "Newton", caesar: "Caesar", croesus: "Croesus",
  icarus: "Icarus", midas: "Midas", don_quixote: "Don Quixote", napoleon: "Napoleon",
};

type WalletResult = {
  label: string; address: string; source: string; elapsedMs: number;
  historyComplete: boolean; transactionsAnalyzed: number; qualifyingSwaps: number;
  tradedTokenCount: number; completedPositions: number; openPositions: number; reentries: number;
  observedVolumeUsd: number | null; volumeCoverage: number; realizedPnlUsd: number | null; pnlCoverage: number;
  historicalPriceCoverage: number; currentPriceCoverage: number;
  personas: Record<string, { match: number | null; confidence: number; eligible: boolean }>;
  winner: { personaId: string; match: number; confidence: number } | null;
  runnerUp: { personaId: string; match: number; confidence: number } | null;
  winnerMargin: number | null;
  icarus: {
    eligibleEpisodes: number; pricedEpisodes: number; externalRequests: number;
    providerFailures: number; unsupportedMints: number; requestLimitReached: boolean;
    candidates?: Array<{
      mint: string; symbol?: string; entryPriceUsd: number; observedPeakPriceUsd: number;
      finalPriceUsd: number; peakReturnPct: number | null; givebackPct: number | null;
      historicalPriceCoverage: number; sampleCount: number;
    }>;
  };
  cost: {
    externalRequests: number; cacheHits: number; providerFailures: number;
    unsupportedMints: number; requestLimitReached: boolean;
    positionsAvailable: number; positionsConsidered: number;
  };
  outbound: { helius: number; coingecko: number; coinbase: number; other: number };
};

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, digits = 2) {
  return value === null ? null : Number(value.toFixed(digits));
}

function pct(count: number, total: number) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(1));
}

export async function buildReport() {
  const dataset = JSON.parse(readFileSync(join(OUTPUT_DIR, "dataset.json"), "utf8")) as {
    harvestedAt: string;
    entries: Array<{ label: string; address: string; source: string }>;
  };
  const lines = readFileSync(join(OUTPUT_DIR, "raw-results.jsonl"), "utf8").split(/\r?\n/).filter(Boolean);
  const results: WalletResult[] = [];
  const failures: Array<{ label: string; address: string; source: string; error: string }> = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as Partial<WalletResult> & { error?: string };
    if (parsed.error) failures.push(parsed as typeof failures[number]);
    else results.push(parsed as WalletResult);
  }
  results.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const total = results.length;

  // --- per-persona aggregates ---
  const perPersona = PERSONAS.map((personaId) => {
    const scores = results.map((result) => result.personas[personaId]);
    const measurable = scores.filter((score) => score.match !== null);
    const matches = measurable.map((score) => score.match as number);
    const confidences = scores.map((score) => score.confidence);
    return {
      personaId,
      measurableCount: measurable.length,
      nullCount: scores.length - measurable.length,
      zeroCount: matches.filter((match) => match === 0).length,
      eligibleCount: scores.filter((score) => score.eligible).length,
      measurabilityRate: round(pct(measurable.length, total), 1),
      eligibilityRate: round(pct(scores.filter((score) => score.eligible).length, total), 1),
      averageMatch: round(mean(matches)),
      medianMatch: round(median(matches)),
      averageConfidence: round(mean(confidences)),
      medianConfidence: round(median(confidences)),
      winnerCount: results.filter((result) => result.winner?.personaId === personaId).length,
    };
  });

  // --- winner distribution / margins ---
  const winnerDistribution = Object.fromEntries(PERSONAS.map((personaId) => [personaId, 0])) as Record<PersonaId, number>;
  let noEligibleCount = 0;
  let singleEligibleCount = 0;
  const margins: number[] = [];
  for (const result of results) {
    if (!result.winner) noEligibleCount += 1;
    else winnerDistribution[result.winner.personaId as PersonaId] += 1;
    if (result.winner && !result.runnerUp) singleEligibleCount += 1;
    if (result.winnerMargin !== null) margins.push(result.winnerMargin);
  }
  const marginBuckets = {
    "0-4": margins.filter((margin) => margin <= 4).length,
    "5-9": margins.filter((margin) => margin >= 5 && margin <= 9).length,
    "10-19": margins.filter((margin) => margin >= 10 && margin <= 19).length,
    "20+": margins.filter((margin) => margin >= 20).length,
  };

  // --- overlaps (>= 70 on both) ---
  const overlapPairs: Array<[PersonaId, PersonaId]> = [
    ["sisyphus", "caesar"],
    ["newton", "napoleon"],
  ];
  const namedOverlaps = overlapPairs.map(([left, right]) => {
    const shared = results.filter((result) =>
      (result.personas[left]?.match ?? 0) >= 70 && (result.personas[right]?.match ?? 0) >= 70);
    return { personas: [left, right], count: shared.length, percent: round(pct(shared.length, total), 1), wallets: shared.map((result) => result.label) };
  });
  const allPairs: Array<{ pair: string; count: number; percent: number }> = [];
  for (let i = 0; i < PERSONAS.length; i += 1) {
    for (let j = i + 1; j < PERSONAS.length; j += 1) {
      const left = PERSONAS[i];
      const right = PERSONAS[j];
      const count = results.filter((result) =>
        (result.personas[left]?.match ?? 0) >= 70 && (result.personas[right]?.match ?? 0) >= 70).length;
      allPairs.push({ pair: `${PERSONA_NAMES[left]} + ${PERSONA_NAMES[right]}`, count, percent: pct(count, total) });
    }
  }
  const overlapsWithCounts = allPairs.filter((pair) => pair.count > 0).sort((a, b) => b.count - a.count);

  // --- Icarus coverage ---
  const icarusMeasurable = results.filter((result) => result.personas.icarus.match !== null);
  const icarusNotMeasurable = results.filter((result) => result.personas.icarus.match === null);
  const icarusEligible = results.filter((result) => result.personas.icarus.eligible);
  const budgetLimited = results.filter((result) => result.icarus.requestLimitReached);

  // --- API cost ---
  const costTotals = {
    heliusRequests: results.reduce((sum, result) => sum + result.outbound.helius, 0),
    coinbaseRequests: results.reduce((sum, result) => sum + result.outbound.coinbase, 0),
    coingeckoRequests: results.reduce((sum, result) => sum + result.outbound.coingecko, 0),
    tokenHistoryRequests: results.reduce((sum, result) => sum + result.cost.externalRequests, 0),
    cacheHits: results.reduce((sum, result) => sum + result.cost.cacheHits, 0),
    providerFailures: results.reduce((sum, result) => sum + result.cost.providerFailures, 0),
    unsupportedMints: results.reduce((sum, result) => sum + result.cost.unsupportedMints, 0),
  };

  // --- outliers ---
  const topMatches = Object.fromEntries(PERSONAS.map((personaId) => {
    const ranked = results
      .filter((result) => result.personas[personaId].match !== null)
      .sort((a, b) => (b.personas[personaId].match as number) - (a.personas[personaId].match as number))
      .slice(0, 5)
      .map((result) => ({ label: result.label, source: result.source, match: result.personas[personaId].match, eligible: result.personas[personaId].eligible }));
    return [personaId, ranked];
  }));
  const lowestWinners = results
    .filter((result) => result.winner)
    .sort((a, b) => (a.winner!.match - b.winner!.match))
    .slice(0, 10)
    .map((result) => ({ label: result.label, source: result.source, persona: result.winner!.personaId, match: result.winner!.match, margin: result.winnerMargin, txs: result.transactionsAnalyzed }));

  // --- dataset coverage stats ---
  const coverageStats = {
    qualifyingSwaps: { total: results.reduce((sum, r) => sum + r.qualifyingSwaps, 0), min: Math.min(...results.map((r) => r.qualifyingSwaps)), median: round(median(results.map((r) => r.qualifyingSwaps)), 0), max: Math.max(...results.map((r) => r.qualifyingSwaps)) },
    observedVolumeWallets: results.filter((r) => r.observedVolumeUsd !== null).length,
    pnlCoverageMean: round(mean(results.map((r) => r.pnlCoverage)), 3),
    volumeCoverageMean: round(mean(results.map((r) => r.volumeCoverage)), 3),
    historicalPriceCoverageMean: round(mean(results.map((r) => r.historicalPriceCoverage)), 3),
    currentPriceCoverageMean: round(mean(results.map((r) => r.currentPriceCoverage)), 3),
  };

  const generatedAt = new Date().toISOString();
  const summary = {
    generatedAt,
    datasetSize: dataset.entries.length,
    scoredWallets: total,
    failedWallets: failures.length,
    perPersona,
    winnerDistribution,
    noEligiblePersonaCount: noEligibleCount,
    noEligiblePersonaRate: round(pct(noEligibleCount, total), 1),
    singleEligibleCount,
    marginBuckets,
    namedOverlaps,
    overlapsWithCounts,
    icarus: {
      measurableCount: icarusMeasurable.length,
      notMeasurableCount: icarusNotMeasurable.length,
      eligibleCount: icarusEligible.length,
      eligibleEpisodesConsidered: results.reduce((sum, r) => sum + r.icarus.eligibleEpisodes, 0),
      episodesPriced: results.reduce((sum, r) => sum + r.icarus.pricedEpisodes, 0),
      unsupportedMints: results.reduce((sum, r) => sum + r.icarus.unsupportedMints, 0),
      budgetLimitedWallets: budgetLimited.map((r) => r.label),
    },
    cost: {
      ...costTotals,
      heliusPerWallet: round(costTotals.heliusRequests / total, 1),
      tokenHistoryPerWallet: round(costTotals.tokenHistoryRequests / total, 1),
      priceOutboundPerWallet: round((costTotals.coinbaseRequests + costTotals.coingeckoRequests) / total, 1),
    },
    coverageStats,
    topMatches,
    lowestWinners,
  };

  writeFileSync(join(OUTPUT_DIR, "raw-results.json"), `${JSON.stringify({ generatedAt, dataset: dataset.entries, failures, results }, null, 2)}\n`);
  writeFileSync(join(OUTPUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeMarkdown(summary, results, dataset, failures);
  console.log(`[report] written to ${OUTPUT_DIR}`);
}

async function writeMarkdown(
  summary: any,
  results: WalletResult[],
  dataset: { entries: Array<{ label: string; address: string; source: string }> },
  failures: Array<{ label: string; address: string; source: string; error: string }>,
) {
  const name = (personaId: string) => PERSONA_NAMES[personaId as PersonaId] ?? personaId;
  const lines: string[] = [];
  lines.push("# Phase 5 — Persona Calibration Report", "");
  lines.push(`Generated: ${summary.generatedAt} (Asia/Shanghai)`, "");
  lines.push("First-run, read-only calibration. The eight-Persona system ran UNCHANGED");
  lines.push("(no formula, threshold, eligibility rule, parser, valuation, or UI change).", "");

  lines.push("## 1. Dataset", "");
  lines.push(`- ${dataset.entries.length} wallets selected (${summary.scoredWallets} scored, ${summary.failedWallets} failed)`);
  lines.push("- Harvested from recent on-chain activity of six mints observed during Phase 2–4 validation, plus the four Phase 2–4 seed wallets (A–D).");
  lines.push("- No wallet was chosen to force a Persona to appear; selection is \"recent trader of token X\" only.");
  lines.push("- Bias note: harvesting from recent token activity skews toward currently-active wallets; dormant/dead wallets are underrepresented.", "");

  lines.push("## 2. Winner distribution", "");
  lines.push("| Persona | Wins | Share |");
  lines.push("|---|---:|---:|");
  for (const personaId of PERSONAS) {
    lines.push(`| ${name(personaId)} | ${summary.winnerDistribution[personaId]} | ${pct(summary.winnerDistribution[personaId], summary.scoredWallets).toFixed(1)}% |`);
  }
  lines.push(`| NO_ELIGIBLE_PERSONA | ${summary.noEligiblePersonaCount} | ${summary.noEligiblePersonaRate}% |`);
  lines.push(`| (single-eligible, no runner-up) | ${summary.singleEligibleCount} | ${pct(summary.singleEligibleCount, summary.scoredWallets).toFixed(1)}% |`);
  lines.push("");

  lines.push("## 3. Per-Persona calibration", "");
  lines.push("NULL = not measurable. 0 = measured, behavior absent.", "");
  lines.push("| Persona | Measurable | Eligible | Avg Match | Median Match | Avg Conf | Median Conf | NULL | 0 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const persona of summary.perPersona) {
    lines.push(`| ${name(persona.personaId)} | ${persona.measurabilityRate}% | ${persona.eligibilityRate}% | ${persona.averageMatch ?? "—"} | ${persona.medianMatch ?? "—"} | ${persona.averageConfidence ?? "—"} | ${persona.medianConfidence ?? "—"} | ${persona.nullCount} | ${persona.zeroCount} |`);
  }
  lines.push("");

  lines.push("## 4. Winner margin", "");
  lines.push(`Margins computable for ${results.filter((r) => r.winnerMargin !== null).length} of ${summary.scoredWallets} wallets (winner + runner-up both required).`, "");
  lines.push("| Bucket | Wallets | Share of margin-bearing |");
  lines.push("|---|---:|---:|");
  const marginBuckets = summary.marginBuckets as Record<string, number>;
  const marginTotal = Object.values(marginBuckets).reduce((a, b) => a + b, 0);
  for (const [bucket, count] of Object.entries(marginBuckets)) {
    lines.push(`| ${bucket} pts | ${count} | ${pct(count, marginTotal).toFixed(1)}% |`);
  }
  lines.push("");

  lines.push("## 5. High-score overlaps (both ≥ 70)", "");
  for (const overlap of summary.namedOverlaps) {
    const [left, right] = overlap.personas;
    lines.push(`- ${name(left)} ≥ 70 AND ${name(right)} ≥ 70: **${overlap.count}** wallets (${overlap.percent}%)${overlap.wallets.length ? ` — ${overlap.wallets.join(", ")}` : ""}`);
  }
  lines.push("");
  if (summary.overlapsWithCounts.length > 0) {
    lines.push("All persona pairs with at least one ≥70/≥70 overlap:", "");
    lines.push("| Pair | Wallets | % |");
    lines.push("|---|---:|---:|");
    for (const pair of summary.overlapsWithCounts) lines.push(`| ${pair.pair} | ${pair.count} | ${pair.percent}% |`);
    lines.push("");
  }

  lines.push("## 6. Icarus price coverage", "");
  const icarus = summary.icarus;
  lines.push(`- Measurable (real historical samples): **${icarus.measurableCount}/${summary.scoredWallets}** wallets; not measurable (null): **${icarus.notMeasurableCount}**; eligible: **${icarus.eligibleCount}**.`);
  lines.push(`- Episodes considered (entry+final price legs known): ${icarus.eligibleEpisodesConsidered}; historically priced: ${icarus.episodesPriced}.`);
  lines.push(`- Unsupported mints observed (distinct per wallet, summed): ${icarus.unsupportedMints}.`);
  lines.push(`- Request-budget-limited wallets (20-request cap hit): ${icarus.budgetLimitedWallets.length}${icarus.budgetLimitedWallets.length ? ` — ${icarus.budgetLimitedWallets.join(", ")}` : ""}. The cap was NOT raised.`);
  for (const wallet of results.filter((result) => result.personas.icarus.eligible)) {
    const candidate = wallet.icarus.candidates?.[0];
    if (!candidate) continue;
    lines.push(`- Eligible wallet ${wallet.label} [${wallet.source}] ${candidate.symbol ?? candidate.mint.slice(0, 6)}: peak ${(100 * (candidate.peakReturnPct ?? 0)).toFixed(1)}%, giveback ${(100 * (candidate.givebackPct ?? 0)).toFixed(1)}% (${candidate.sampleCount} samples, ${(100 * candidate.historicalPriceCoverage).toFixed(0)}% coverage).`);
  }
  lines.push("");

  lines.push("## 7. API cost", "");
  const cost = summary.cost;
  lines.push(`- Helius requests: **${cost.heliusRequests}** (${cost.heliusPerWallet}/wallet)`);
  lines.push(`- Historical-price outbound: CoinGecko **${cost.coingeckoRequests}**, Coinbase **${cost.coinbaseRequests}** (${cost.priceOutboundPerWallet}/wallet combined; includes SOL ranges and token ranges)`);
  lines.push(`- Token-history budget requests: ${cost.tokenHistoryRequests} (${cost.tokenHistoryPerWallet}/wallet, hard limit 20 per wallet)`);
  lines.push(`- Cache hits (token price, mint+bucket): **${cost.cacheHits}**`);
  lines.push(`- Provider failures: **${cost.providerFailures}**; unsupported mints: ${cost.unsupportedMints}`);
  lines.push("");

  lines.push("## 8. Coverage of recorded inputs", "");
  const coverage = summary.coverageStats;
  lines.push(`- Qualifying swaps per wallet: min ${coverage.qualifyingSwaps.min}, median ${coverage.qualifyingSwaps.median}, max ${coverage.qualifyingSwaps.max}.`);
  lines.push(`- Wallets with observed USD volume: ${coverage.observedVolumeWallets}/${summary.scoredWallets} (mean volume coverage ${coverage.volumeCoverageMean}).`);
  lines.push(`- Mean PnL coverage: ${coverage.pnlCoverageMean}; mean historical price coverage: ${coverage.historicalPriceCoverageMean}; mean current price coverage: ${coverage.currentPriceCoverageMean}.`);
  lines.push("");

  lines.push("## 9. Outliers (for manual inspection)", "");
  lines.push("### Top 5 Match per Persona");
  for (const personaId of PERSONAS) {
    const entries = summary.topMatches[personaId] as Array<{ label: string; source: string; match: number; eligible: boolean }>;
    lines.push(`- **${name(personaId)}**: ${entries.map((entry) => `${entry.label}=${entry.match}${entry.eligible ? "" : "(inelig.)"} [${entry.source}]`).join(", ") || "no measurable wallet"}`);
  }
  lines.push("");
  lines.push("### Lowest winning Matches");
  lines.push("| Wallet | Source | Winner | Match | Margin | Txs |");
  lines.push("|---|---|---|---:|---:|---:|");
  for (const winner of summary.lowestWinners) {
    lines.push(`| ${winner.label} | ${winner.source} | ${name(winner.persona)} | ${winner.match} | ${winner.margin ?? "n/a"} | ${winner.txs} |`);
  }
  lines.push("");

  if (failures.length) {
    lines.push("## 10. Failed wallets", "");
    lines.push("| Wallet | Source | Error |");
    lines.push("|---|---|---|");
    for (const failure of failures) lines.push(`| ${failure.label} | ${failure.source} | ${failure.error} |`);
    lines.push("");
  }

  lines.push("## Problems observed (no changes made)", "");
  lines.push("Findings are data-driven from this run only; every proposal below is UNIMPLEMENTED and awaits review.", "");
  const problems = buildProblems(summary, results, name);
  lines.push(...problems);
  lines.push("");

  lines.push("## Proposed changes (NOT implemented)", "");
  lines.push("1. If `NO_ELIGIBLE_PERSONA` is high, review eligibility gates (minimum swap counts, dual-price-side requirements) — not the formulas themselves.");
  lines.push("2. If a Persona is never measurable or never eligible on real wallets, audit its evidence requirements for feasibility before touching scoring weights.");
  lines.push("3. If low-margin (0–4) assignments dominate, consider reporting a tie/ambiguous state in UI — a presentation change, not a scoring change.");
  lines.push("4. If Icarus budget caps block coverage on busy wallets, consider smarter mint prioritization within the same 20-request cap.");
  lines.push("");
  lines.push("None of the above has been applied. Formulas, thresholds, and rules are byte-identical to the Phase 4C state.");
  lines.push("");

  writeFileSync(join(OUTPUT_DIR, "phase5-calibration.md"), lines.join("\n"));
}

function buildProblems(summary: any, results: WalletResult[], name: (personaId: string) => string): string[] {
  const problems: string[] = [];
  if (summary.noEligiblePersonaRate > 30) {
    problems.push(`- NO_ELIGIBLE_PERSONA rate is ${summary.noEligiblePersonaRate}% (${summary.noEligiblePersonaCount}/${summary.scoredWallets} wallets).`);
  }
  for (const persona of summary.perPersona) {
    if (persona.measurableCount === 0) {
      problems.push(`- ${name(persona.personaId)} was unmeasurable (NULL) for every wallet in the dataset.`);
    } else if (persona.eligibleCount === 0) {
      problems.push(`- ${name(persona.personaId)} was never eligible across ${summary.scoredWallets} wallets (measurable on ${persona.measurableCount}).`);
    }
    if (persona.measurableCount > 0 && persona.averageMatch !== null && persona.averageMatch < 15) {
      problems.push(`- ${name(persona.personaId)} average measurable Match is very low (${persona.averageMatch}).`);
    }
  }
  const marginTotal = Object.values(summary.marginBuckets as Record<string, number>).reduce((a, b) => a + b, 0);
  if (marginTotal > 0 && (summary.marginBuckets["0-4"] / marginTotal) > 0.4) {
    problems.push(`- ${(100 * summary.marginBuckets["0-4"] / marginTotal).toFixed(1)}% of decidable wallets sit in the 0–4 point margin bucket — winner assignment is frequently ambiguous.`);
  }
  const dominant = Object.entries(summary.winnerDistribution as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
  if (dominant && pct(dominant[1], summary.scoredWallets) > 50) {
    problems.push(`- ${name(dominant[0])} wins ${pct(dominant[1], summary.scoredWallets).toFixed(1)}% of wallets — winner distribution is heavily concentrated.`);
  }
  if (summary.cost.providerFailures > 0) {
    problems.push(`- ${summary.cost.providerFailures} provider failures occurred mid-run; affected wallets may understate coverage.`);
  }
  const partialHistory = results.filter((result) => !result.historyComplete).length;
  if (partialHistory === results.length) {
    problems.push("- Every wallet hit the 1,000-transaction cap; all histories are partial, so open-position and PnL measurability is structurally limited.");
  }
  if (problems.length === 0) problems.push("- No structural problem detected at the thresholds this report checks.");
  return problems;
}
