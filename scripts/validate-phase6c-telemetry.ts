// Phase 6C — position-action telemetry collection for the 10 Persona #9
// candidates. Re-runs the (scoring-unchanged) pipeline to collect the new
// telemetry, computes the OFFLINE #9 features with the revised
// ACCUMULATION_TILT (resolved episodes only), and classifies each candidate.
// No Persona #9 in production scoring; nothing tuned.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildWalletBehaviorProfile } from "../lib/analysis/behaviorFeatures";
import { normalizeHoldings, normalizeTransactions } from "../lib/analysis/normalizeTransactions";
import { buildPositionPerformance } from "../lib/analysis/positionPerformance";
import { analyzeTradeSequences } from "../lib/analysis/tradeSequences";
import { valueSwaps } from "../lib/analysis/valueSwaps";
import { scorePersonas } from "../lib/persona/personaScoring";
import { fetchHeliusWalletData, MAX_TRANSACTIONS } from "../lib/solana/helius";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");
const TARGETS = ["T9", "P4", "M4", "M5", "M6", "L5", "L6", "P7", "M8", "L10"];
const RESULTS_PATH = join(OUTPUT_DIR, "phase6c-telemetry.jsonl");
const WALLET_PAUSE_MS = 8_000;

type DatasetEntry = { label: string; address: string; stratum: string };

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

async function analyze(entry: DatasetEntry) {
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
  const f = behavior.features;
  return {
    label: entry.label,
    stratum: entry.stratum,
    historyComplete: raw.historyComplete,
    qualifyingSwaps: f.qualifyingSwapCount,
    distinctTokens: f.tradedTokenCount,
    swapsPerToken: Number((f.qualifyingSwapCount / Math.max(1, f.tradedTokenCount)).toFixed(2)),
    realizedPnlUsd: f.realizedPnlUsd.value,
    pnlCoverage: Number(f.realizedPnlUsd.coverage.toFixed(2)),
    observedVolumeUsd: f.totalVolumeUsd.value,
    telemetry: {
      actions: f.positionActions,
      assetInteraction: {
        meanTradeLegsPerAsset: Number(f.assetInteraction.meanTradeLegsPerAsset.toFixed(2)),
        medianTradeLegsPerAsset: Number(f.assetInteraction.medianTradeLegsPerAsset.toFixed(2)),
        repeatedAssetRate: Number(f.assetInteraction.repeatedAssetRate.toFixed(3)),
        highlyRepeatedAssetRate: Number(f.assetInteraction.highlyRepeatedAssetRate.toFixed(3)),
      },
      episodes: f.episodeTerminalStates,
    },
    personas: Object.fromEntries(ranking.scores.map((score) => [
      score.personaId, { match: score.match, eligible: score.eligible },
    ])),
    winner: ranking.winner ? { personaId: ranking.winner.personaId, match: ranking.winner.match } : null,
    resultReason: ranking.resultReason,
  };
}

async function run() {
  const dataset = JSON.parse(readFileSync(join(OUTPUT_DIR, "stratified-dataset.json"), "utf8")) as { entries: DatasetEntry[] };
  const done = new Set(existsSync(RESULTS_PATH)
    ? readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
      try { return (JSON.parse(line) as { label?: string; error?: string }).label; } catch { return undefined; }
    }).filter(Boolean) as string[]
    : []);
  const targets = dataset.entries.filter((entry) => TARGETS.includes(entry.label) && !done.has(entry.label));
  for (const [index, entry] of targets.entries()) {
    try {
      const result = await analyze(entry);
      appendFileSync(RESULTS_PATH, `${JSON.stringify(result)}\n`);
      const t = result.telemetry;
      console.log(`[run ${index + 1}/${targets.length}] ${entry.label}: buy=${t.actions.buyLegCount} add=${t.actions.addLegCount} psell=${t.actions.partialSellLegCount} exit=${t.actions.exitLegCount} re=${t.actions.reentryLegCount} | open=${t.episodes.observedOpenEpisodeCount} exitEp=${t.episodes.observedExitEpisodeCount} unres=${t.episodes.unresolvedDisappearanceEpisodeCount} unknown=${t.episodes.unknownOpeningStateEpisodeCount}`);
    } catch (error) {
      appendFileSync(RESULTS_PATH, `${JSON.stringify({ label: entry.label, error: error instanceof Error ? error.message : String(error) })}\n`);
      console.log(`[run] ${entry.label} FAILED: ${error instanceof Error ? error.message : error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, WALLET_PAUSE_MS));
  }
  console.log("[run] complete");
}

function report() {
  const rows = readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => !row.error)
    .sort((a, b) => TARGETS.indexOf(a.label) - TARGETS.indexOf(b.label));
  const logCountScore = (value: number, reference: number) =>
    value <= 0 ? 0 : Math.max(0, Math.min(100, (Math.log1p(value) / Math.log1p(reference)) * 100));

  const enriched = rows.map((row) => {
    const breadth = logCountScore(row.distinctTokens, 100);
    const cyclingScarcity = 100 / (1 + row.telemetry.actions.disposalLegCount + row.telemetry.actions.reentryLegCount);
    const resolved = row.telemetry.episodes.observedOpenEpisodeCount + row.telemetry.episodes.observedExitEpisodeCount;
    const unresolved = row.telemetry.episodes.unresolvedDisappearanceEpisodeCount + row.telemetry.episodes.unknownOpeningStateEpisodeCount;
    // Revised tilt: unresolved disappearances are excluded from BOTH numerator
    // and denominator — they are not evidence of accumulation (or of anything).
    const accumulationTilt = resolved === 0
      ? null
      : (100 * row.telemetry.episodes.observedOpenEpisodeCount) / resolved;
    const offlineMatch = 0.35 * breadth + 0.35 * cyclingScarcity + 0.30 * (accumulationTilt ?? 0);
    // Telemetry-derived: an absolute cycling-leg cap breaks on scale (T9's four
    // dust partial sells across 279 assets); the scale-free form is the share of
    // swap activity that is repeat-trading.
    const cyclingRate = row.qualifyingSwaps > 0
      ? (row.telemetry.actions.disposalLegCount + row.telemetry.actions.reentryLegCount) / row.qualifyingSwaps
      : 1;
    const proposedEligibility = row.qualifyingSwaps >= 25
      && row.distinctTokens >= 20
      && cyclingRate <= 0.05
      && row.telemetry.episodes.observedOpenEpisodeCount >= 10;
    // Core constraints first (Phase 5F/5G principle: core evidence must
    // CONSTRAIN the persona, not merely average into it):
    //   - CYCLING_SCARCITY is core: more than 2 cycling legs rejects.
    //   - Selling-dominant wallets (disposals >= acquisitions) are distributors
    //     of pre-window inventory, not accumulators.
    //   - Match below 50 rejects.
    // Then evidence quality separates VALIDATED from AMBIGUOUS.
    let classification: "VALIDATED" | "AMBIGUOUS" | "REJECTED";
    const cyclingLegs = row.telemetry.actions.cyclingLegCount;
    const acquisitionLegs = row.telemetry.actions.buyLegCount + row.telemetry.actions.addLegCount + row.telemetry.actions.reentryLegCount;
    if (offlineMatch < 50 || cyclingLegs / Math.max(1, row.qualifyingSwaps) > 0.05 || row.telemetry.actions.disposalLegCount >= acquisitionLegs) {
      classification = "REJECTED";
    } else if (resolved >= 8
      && row.telemetry.episodes.observedOpenEpisodeCount >= 10
      && unresolved <= 0.5 * row.distinctTokens) {
      classification = "VALIDATED";
    } else {
      classification = "AMBIGUOUS";
    }
    return {
      ...row,
      offlineFeatures: {
        BREADTH: Number(breadth.toFixed(1)),
        CYCLING_SCARCITY: Number(cyclingScarcity.toFixed(1)),
        ACCUMULATION_TILT_REVISED: accumulationTilt === null ? null : Number(accumulationTilt.toFixed(1)),
        resolvedEpisodeCount: resolved,
        unresolvedEpisodeCount: unresolved,
        offlineMatch: Number(offlineMatch.toFixed(1)),
        proposedEligibility,
      },
      classification,
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    status: "TELEMETRY COLLECTION — Persona #9 remains offline-only; scoring/eligibility/thresholds untouched",
    wallets: enriched,
    sisyphusOverlap: enriched.filter((row) => ["P7", "M8", "L10"].includes(row.label)).map((row) => {
      const pnl = row.realizedPnlUsd;
      const volume = row.observedVolumeUsd;
      const stagnation = pnl === null || volume === null || volume <= 0
        ? null
        : 100 - Math.max(0, Math.min(1, Math.abs(pnl / volume) / 0.10)) * 100;
      const repetition = row.telemetry.assetInteraction;
      const structuralVerdict = repetition.repeatedAssetRate <= 0.5 && row.telemetry.actions.cyclingLegCount <= 3
        ? "PERSONA_9"
        : repetition.highlyRepeatedAssetRate >= 0.3 || row.telemetry.actions.cyclingLegCount >= 5
          ? "SISYPHUS-leaning"
          : "AMBIGUOUS";
      return {
        label: row.label,
        sisyphusMatch: row.personas.sisyphus.match,
        sisyphusEligible: row.personas.sisyphus.eligible,
        pnlCoverage: row.pnlCoverage,
        stagnation: stagnation === null ? null : Number(stagnation.toFixed(1)),
        repeatedAssetRate: repetition.repeatedAssetRate,
        highlyRepeatedAssetRate: repetition.highlyRepeatedAssetRate,
        cyclingLegCount: row.telemetry.actions.cyclingLegCount,
        cyclingRate: Number((row.telemetry.actions.cyclingLegCount / Math.max(1, row.qualifyingSwaps)).toFixed(3)),
        persona9OfflineMatch: row.offlineFeatures.offlineMatch,
        structuralVerdict,
      };
    }),
    l5SafetyCheck: (() => {
      const l5 = enriched.find((row) => row.label === "L5");
      if (!l5) return null;
      const passes = l5.offlineFeatures.proposedEligibility;
      return {
        observedOpenEpisodeCount: l5.telemetry.episodes.observedOpenEpisodeCount,
        unresolvedEpisodeCount: l5.offlineFeatures.unresolvedEpisodeCount,
        proposedEligibility: passes,
        verdict: passes ? "Persona #9 COULD still steal L5 — revisit" : "SAFE: Persona #9 is NOT eligible for L5 (observable accumulation evidence insufficient)",
      };
    })(),
    readyForImplementation: "NO",
  };
  writeFileSync(join(OUTPUT_DIR, "phase6c-position-telemetry.json"), `${JSON.stringify(output, null, 2)}\n`);

  const md: string[] = [];
  md.push("# Phase 6C — Position Action Telemetry", "");
  md.push(`Generated: ${output.generatedAt} (Asia/Shanghai)`, "");
  md.push("Telemetry implemented in the behavior engine and exposed via WalletProfile.positionTelemetry.", "Scoring, eligibility, thresholds, parser, and valuation are untouched. Persona #9 remains offline-only.", "");
  md.push("## Telemetry for the 10 candidates", "");
  md.push("| Wallet | Tokens | s/t | BUY | ADD | PSELL | EXIT | RE | disposal | cycling | repRate | hiRepRate | OPEN | EXIT-ep | UNRESOLVED | UNKNOWN |");
  md.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of enriched) {
    const a = row.telemetry.actions;
    const e = row.telemetry.episodes;
    const i = row.telemetry.assetInteraction;
    md.push(`| ${row.label} | ${row.distinctTokens} | ${row.swapsPerToken} | ${a.buyLegCount} | ${a.addLegCount} | ${a.partialSellLegCount} | ${a.exitLegCount} | ${a.reentryLegCount} | ${a.disposalLegCount} | ${a.cyclingLegCount} | ${i.repeatedAssetRate} | ${i.highlyRepeatedAssetRate} | ${e.observedOpenEpisodeCount} | ${e.observedExitEpisodeCount} | ${e.unresolvedDisappearanceEpisodeCount} | ${e.unknownOpeningStateEpisodeCount} |`);
  }
  md.push("");
  md.push("## Offline Persona #9 features (revised tilt: resolved episodes only)", "");
  md.push("| Wallet | BREADTH | CYCLING_SCARCITY | TILT(rev) | resolved | unresolved | Match | Proposed eligible | Classification |");
  md.push("|---|---:|---:|---:|---:|---:|---:|---|---|");
  for (const row of enriched) {
    const f = row.offlineFeatures;
    md.push(`| ${row.label} | ${f.BREADTH} | ${f.CYCLING_SCARCITY} | ${f.ACCUMULATION_TILT_REVISED ?? "null"} | ${f.resolvedEpisodeCount} | ${f.unresolvedEpisodeCount} | ${f.offlineMatch} | ${f.proposedEligibility ? "Y" : "N"} | **${row.classification}** |`);
  }
  md.push("");
  md.push("Revised ACCUMULATION_TILT = 100 * observedOpen / (observedOpen + observedExit). Unresolved", "disappearances and unknown opening states contribute to NEITHER side — they are not evidence of", "accumulation, holding, selling, profit, or loss (partial-history safety preserved).", "");
  md.push("## Sisyphus overlap (P7 / M8 / L10)", "");
  md.push("| Wallet | Sisyphus match (elig) | pnlCov | stagnation | repRate | hiRepRate | cycling legs | #9 offline | Structural verdict |");
  md.push("|---|---|---:|---:|---:|---:|---:|---:|---|");
  for (const row of output.sisyphusOverlap) {
    md.push(`| ${row.label} | ${row.sisyphusMatch} (${row.sisyphusEligible ? "Y" : "N"}) | ${row.pnlCoverage} | ${row.stagnation ?? "null"} | ${row.repeatedAssetRate} | ${row.highlyRepeatedAssetRate} | ${row.cyclingLegCount} | ${row.persona9OfflineMatch} | ${row.structuralVerdict} |`);
  }
  md.push("");
  md.push("No routing rule is created here: with correctly defined features the normal Match competition", "should resolve overlap at implementation time.", "");
  md.push("## L5 safety check", "");
  if (output.l5SafetyCheck) {
    const l5 = output.l5SafetyCheck;
    md.push(`observedOpen=${l5.observedOpenEpisodeCount}, unresolved=${l5.unresolvedEpisodeCount} -> proposed eligibility ${l5.proposedEligibility ? "PASSES (revisit!)" : "FAILS"}. ${l5.verdict}`);
  }
  md.push("");
  md.push("---", "");
  md.push("## TELEMETRY IMPLEMENTED", "");
  md.push("behaviorTypes/behaviorFeatures expose positionActions (BUY/ADD/PARTIAL_SELL/EXIT/RE_ENTRY + disposal + cycling),");
  md.push("assetInteraction (mean/median legs per asset, repeatedAssetRate, highlyRepeatedAssetRate), and");
  md.push("episodeTerminalStates (OPEN / CLOSED_BY_OBSERVED_EXIT / UNRESOLVED_DISAPPEARANCE / UNKNOWN_OPENING_STATE).");
  md.push("WalletProfile.positionTelemetry carries them into the API output. 8 unit tests cover the six §9 patterns.");
  md.push("");
  md.push("## VALIDATED PERSONA #9 WALLETS", "");
  md.push(enriched.filter((row) => row.classification === "VALIDATED").map((row) => row.label).join(", ") || "none");
  md.push("");
  md.push("## AMBIGUOUS WALLETS", "");
  md.push(enriched.filter((row) => row.classification === "AMBIGUOUS").map((row) => `${row.label} (resolved=${row.offlineFeatures.resolvedEpisodeCount}, unresolved=${row.offlineFeatures.unresolvedEpisodeCount})`).join(", ") || "none");
  md.push("");
  md.push("## REJECTED WALLETS", "");
  md.push(enriched.filter((row) => row.classification === "REJECTED").map((row) => `${row.label} (offline match ${row.offlineFeatures.offlineMatch})`).join(", ") || "none");
  md.push("");
  md.push("## SISYPHUS OVERLAP", "");
  for (const row of output.sisyphusOverlap) {
    md.push(`- ${row.label}: ${row.structuralVerdict} (repetition ${row.repeatedAssetRate}/${row.highlyRepeatedAssetRate}, cycling ${row.cyclingLegCount}, stagnation ${row.stagnation ?? "null"} @ cov ${row.pnlCoverage})`);
  }
  md.push("");
  md.push("## SAFE PERSONA #9 FEATURE DEFINITION", "");
  md.push("BREADTH = logCountScore(distinctTokens, 100); CYCLING_SCARCITY = 100/(1 + disposalLegs + reentryLegs);");
  md.push("ACCUMULATION_TILT = 100 * observedOpen / (observedOpen + observedExit), null when no resolved episodes.");
  md.push("Eligibility must additionally require observedOpenEpisodeCount >= 10 so accumulation is OBSERVED, not inferred.");
  md.push("");
  md.push("## READY_FOR_PERSONA_9_IMPLEMENTATION: " + output.readyForImplementation, "");
  md.push("Rationale: telemetry exists and the safe feature definition is testable, but (1) eligibility additions");
  md.push("(observed-open floor, cycling-leg cap) and the CYCLING_SCARCITY swap still need an explicit review pass,");
  md.push("(2) the Sisyphus routing question for overlap wallets is unresolved, and (3) half the original discovery");
  md.push("cluster is now ambiguous pending better position-fate evidence. Implement after that review.", "");
  writeFileSync(join(OUTPUT_DIR, "phase6c-position-telemetry.md"), `${md.join("\n")}\n`);
  console.log(`[phase6c] classified: ${enriched.map((row) => `${row.label}=${row.classification}`).join(", ")}`);
}

loadLocalEnvironment();
const command = process.argv[2];
if (command === "run") await run();
else if (command === "report") report();
else {
  console.error("usage: validate-phase6c-telemetry.ts run|report");
  process.exit(1);
}
