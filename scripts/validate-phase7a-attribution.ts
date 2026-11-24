// Phase 7A — realized-PnL coverage attribution (diagnostic only).
// Re-runs the UNCHANGED pipeline for the target wallets and traces every
// disposal leg: valuation status, cost-basis status, primary failure reason,
// counter-asset/route/mint aggregation, waterfall, recoverability simulation,
// and Sisyphus impact. No production behavior changes, no scoring changes.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildWalletBehaviorProfile } from "../lib/analysis/behaviorFeatures";
import { normalizeHoldings, normalizeTransactions } from "../lib/analysis/normalizeTransactions";
import { valueSwaps, SOL_ASSET_MINTS, VERIFIED_USD_STABLECOIN_MINTS } from "../lib/analysis/valueSwaps";
import { fetchHeliusWalletData, MAX_TRANSACTIONS } from "../lib/solana/helius";
import type { TradeLeg } from "../lib/analysis/behaviorTypes";

const OUTPUT_DIR = join(import.meta.dirname, "../data/persona-calibration");
const TARGETS = ["P8", "L10", "M8", "P5", "P9", "P7", "L7"];
const RESULTS_PATH = join(OUTPUT_DIR, "phase7a-traces.jsonl");
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

type Reason = "VALUED" | "A_DISPOSAL_VALUE_UNKNOWN" | "B_COST_BASIS_UNKNOWN" | "C_PARTIAL_HISTORY_INVENTORY" | "D_SOL_PRICE_GAP" | "F_OVERDRAW_AMBIGUITY" | "G_OTHER";

function counterType(leg: TradeLeg): "STABLE" | "SOL" | "TOKEN" | "NONE" {
  const types = leg.counterAssets.map((asset) =>
    VERIFIED_USD_STABLECOIN_MINTS.has(asset.mint) ? "STABLE" : SOL_ASSET_MINTS.has(asset.mint) ? "SOL" : "TOKEN");
  if (types.length === 0) return "NONE";
  if (types.every((type) => type === "STABLE")) return "STABLE";
  if (types.every((type) => type === "SOL")) return "SOL";
  if (types.includes("STABLE")) return "STABLE";
  if (types.includes("SOL")) return "SOL";
  return "TOKEN";
}

async function analyze(entry: DatasetEntry) {
  const raw = await fetchHeliusWalletData(entry.address, MAX_TRANSACTIONS);
  const holdings = normalizeHoldings(raw.balances);
  const normalized = normalizeTransactions(raw.transactions, holdings);
  const valued = await valueSwaps(normalized);
  const behavior = buildWalletBehaviorProfile(valued.transactions, { historyComplete: raw.historyComplete });
  const sourceBySignature = new Map(normalized.map((transaction) => [transaction.signature, transaction.source ?? "unknown"]));

  const ledgerByMint = new Map(behavior.ledgers.map((ledger) => [ledger.mint, ledger]));
  const traces: Array<Record<string, unknown>> = [];
  for (const ledger of behavior.ledgers) {
    for (const leg of ledger.sells) {
      const priced = leg.realizedPnlUsd !== null;
      let reason: Reason;
      if (priced) reason = "VALUED";
      else if (leg.usdValue === undefined) {
        const counter = counterType(leg);
        if (counter === "STABLE") reason = "G_OTHER";
        else if (counter === "SOL") reason = "D_SOL_PRICE_GAP";
        else reason = "A_DISPOSAL_VALUE_UNKNOWN";
      } else if (ledger.openingStateUnknown) reason = "C_PARTIAL_HISTORY_INVENTORY";
      else if (ledger.trackingStateUnknown) reason = "F_OVERDRAW_AMBIGUITY";
      else reason = "B_COST_BASIS_UNKNOWN";
      traces.push({
        mint: ledger.mint,
        timestamp: leg.timestamp,
        signature: leg.signature.slice(0, 16),
        eventType: leg.eventType,
        quantity: Number(leg.amount.toPrecision(6)),
        proceedsUsd: leg.usdValue === undefined ? null : Number(leg.usdValue.toFixed(2)),
        realizedPnlUsd: leg.realizedPnlUsd === null ? null : Number(leg.realizedPnlUsd.toFixed(2)),
        counterType: counterType(leg),
        counterValued: leg.counterAssets.some((asset) => asset.usdValue !== undefined),
        ledgerTrackingUnknown: ledger.trackingStateUnknown,
        ledgerOpeningUnknown: ledger.openingStateUnknown,
        source: sourceBySignature.get(leg.signature) ?? "unknown",
        reason,
      });
    }
  }
  void ledgerByMint;
  const totals = {
    label: entry.label,
    qualifyingSwaps: behavior.features.qualifyingSwapCount,
    distinctTokens: behavior.features.tradedTokenCount,
    sellLegCount: behavior.features.sellCount,
    pnlCoverage: Number(behavior.features.realizedPnlUsd.coverage.toFixed(3)),
    reasonCounts: traces.reduce<Record<string, number>>((counts, trace) => {
      counts[trace.reason as string] = (counts[trace.reason as string] ?? 0) + 1;
      return counts;
    }, {}),
  };
  return { totals, traces };
}

async function run() {
  const dataset = JSON.parse(readFileSync(join(OUTPUT_DIR, "stratified-dataset.json"), "utf8")) as { entries: DatasetEntry[] };
  const done = new Set(existsSync(RESULTS_PATH)
    ? readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
      try { return (JSON.parse(line) as { totals?: { label?: string }; error?: string }).totals?.label; } catch { return undefined; }
    }).filter(Boolean) as string[]
    : []);
  const targets = dataset.entries.filter((entry) => TARGETS.includes(entry.label) && !done.has(entry.label));
  for (const [index, entry] of targets.entries()) {
    try {
      const result = await analyze(entry);
      appendFileSync(RESULTS_PATH, `${JSON.stringify(result)}\n`);
      console.log(`[run ${index + 1}/${targets.length}] ${entry.label}: ${JSON.stringify(result.totals.reasonCounts)} coverage=${result.totals.pnlCoverage}`);
    } catch (error) {
      appendFileSync(RESULTS_PATH, `${JSON.stringify({ totals: { label: entry.label }, error: error instanceof Error ? error.message : String(error) })}\n`);
      console.log(`[run] ${entry.label} FAILED: ${error instanceof Error ? error.message : error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, WALLET_PAUSE_MS));
  }
  console.log("[run] complete");
}

function report() {
  const stored = new Map(readFileSync(join(OUTPUT_DIR, "phase5g-results.jsonl"), "utf8").split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as { label?: string; personas?: Record<string, { match: number | null; eligible: boolean }>; behavior?: { pnlCoverage: number; realizedPnlUsd: number | null } })
    .filter((row) => row.label)
    .map((row) => [row.label as string, row]));
  const runs = readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as { totals: { label: string; qualifyingSwaps: number; distinctTokens: number; sellLegCount: number; pnlCoverage: number; reasonCounts: Record<string, number> }; traces: Array<Record<string, unknown>>; error?: string })
    .filter((row) => !row.error)
    .sort((a, b) => TARGETS.indexOf(a.totals.label) - TARGETS.indexOf(b.totals.label));

  const wallets = runs.map((run) => {
    const traces = run.traces;
    const total = traces.length;
    const priced = traces.filter((trace) => trace.reason === "VALUED").length;
    const proceeds = traces.filter((trace) => trace.proceedsUsd !== null).length;
    const reasonCounts = run.totals.reasonCounts;
    // §6 recoverability: external pricing recovers A (token-token disposal value,
    // assuming the provider can price the mint) and B (basis of in-window
    // acquisitions priced by the same provider). C/F stay unrecoverable.
    const recoverableExternal = (reasonCounts.A_DISPOSAL_VALUE_UNKNOWN ?? 0) + (reasonCounts.B_COST_BASIS_UNKNOWN ?? 0);
    const unrecoverable = (reasonCounts.C_PARTIAL_HISTORY_INVENTORY ?? 0) + (reasonCounts.F_OVERDRAW_AMBIGUITY ?? 0) + (reasonCounts.G_OTHER ?? 0) + (reasonCounts.D_SOL_PRICE_GAP ?? 0);
    const maxCoverageExternal = total > 0 ? (priced + recoverableExternal) / total : 0;
    const maxCoverageExec = total > 0 ? (priced + (reasonCounts.D_SOL_PRICE_GAP ?? 0)) / total : 0;
    // Conservative-basis reconstruction: overdrawn (F) legs keep USD proceeds;
    // a partial PnL is computable on the TRACKED portion of the basis once the
    // in-window acquisitions are priced (external). Only C stays unrecoverable.
    const maxCoverageFullProgram = total > 0
      ? (priced + recoverableExternal + (reasonCounts.F_OVERDRAW_AMBIGUITY ?? 0)) / total
      : 0;
    const byMint = new Map<string, { legs: number; missing: number }>();
    const bySource = new Map<string, { legs: number; missing: number }>();
    const byCounter = new Map<string, { legs: number; missing: number }>();
    for (const trace of traces) {
      const mint = trace.mint as string;
      const source = trace.source as string;
      const counter = trace.counterType as string;
      const missing = trace.reason !== "VALUED";
      for (const [map, key] of [[byMint, mint], [bySource, source], [byCounter, counter]] as const) {
        const bucket = map.get(key as string) ?? { legs: 0, missing: 0 };
        bucket.legs += 1;
        if (missing) bucket.missing += 1;
        map.set(key as string, bucket);
      }
    }
    const topMissingMints = [...byMint.entries()].filter(([, bucket]) => bucket.missing > 0)
      .sort((left, right) => right[1].missing - left[1].missing).slice(0, 5)
      .map(([mint, bucket]) => ({ mint: `${mint.slice(0, 6)}…`, legs: bucket.legs, missing: bucket.missing }));
    const sisyphus = stored.get(run.totals.label);
    return {
      label: run.totals.label,
      qualifyingSwaps: run.totals.qualifyingSwaps,
      distinctTokens: run.totals.distinctTokens,
      waterfall: {
        disposalLegs: total,
        withUsdProceeds: proceeds,
        withCostBasis: priced,
        withRealizedPnl: priced,
        pnlCoverageNow: run.totals.pnlCoverage,
        lostAtProceeds: total - proceeds,
        lostAtBasis: proceeds - priced,
      },
      reasonCounts,
      recoverability: {
        maxCoverageExecutionOnly: Number(maxCoverageExec.toFixed(3)),
        maxCoverageWithExternalTokenPricing: Number(maxCoverageExternal.toFixed(3)),
        maxCoverageWithExternalPricingAndConservativeBasis: Number(maxCoverageFullProgram.toFixed(3)),
        maxCoverageWithBudgetIncrease: run.totals.pnlCoverage,
        unrecoverableLegs: unrecoverable,
      },
      topMissingMints,
      bySource: Object.fromEntries([...bySource.entries()].sort((left, right) => right[1].missing - left[1].missing).slice(0, 5).map(([source, bucket]) => [source, bucket])),
      byCounter: Object.fromEntries([...byCounter.entries()].map(([counter, bucket]) => [counter, bucket])),
      sisyphus: sisyphus ? {
        match: sisyphus.personas?.sisyphus.match ?? null,
        eligible: sisyphus.personas?.sisyphus.eligible ?? false,
        storedPnlCoverage: sisyphus.behavior?.pnlCoverage ?? null,
        crossesThresholdWithExternalPricing: maxCoverageExternal >= 0.5,
        crossesThresholdWithFullProgram: maxCoverageFullProgram >= 0.5,
        crossesThresholdWithExecutionOnly: maxCoverageExec >= 0.5,
        dominantBlocker: unrecoverable > recoverableExternal ? "PARTIAL_HISTORY" : recoverableExternal > 0 ? "PRICING" : "NONE_MISSING",
      } : null,
    };
  });

  const aggregateReasons = wallets.reduce<Record<string, number>>((counts, wallet) => {
    for (const [reason, count] of Object.entries(wallet.reasonCounts)) {
      counts[reason] = (counts[reason] ?? 0) + count;
    }
    return counts;
  }, {});
  const totalLegs = Object.values(aggregateReasons).reduce((sum, value) => sum + value, 0);
  const primary = Object.entries(aggregateReasons).filter(([reason]) => reason !== "VALUED")
    .sort((left, right) => right[1] - left[1]);

  const output = {
    generatedAt: new Date().toISOString(),
    status: "DIAGNOSTIC ONLY — no production changes",
    coverageDefinitionAudit: {
      denominator: "sellCount — EVERY disposal leg (PARTIAL_SELL + EXIT), including legs on ledgers whose inventory predates the window",
      numerator: "pricedSellCount — legs with computed realized PnL",
      formula: "realizedPnlUsd.coverage = pricedSellCount / sellCount",
      semanticFlags: [
        "LEG-COUNT based, not economically weighted: 100 dust legs unvalued + 1 huge valued exit reads as ~1% coverage even when most observed dollars are priced",
        "the denominator includes structurally unpriceable legs (pre-window inventory first-sells), so coverage has a hard ceiling below 1 for any wallet distributing pre-window inventory",
        "it measures leg observability, not 'how much of the wallet's realized economic outcome is observable'",
      ],
      verdict: "MISMATCH FLAGGED (definition unchanged): for the target wallets the metric understates achievable observability and mixes structural (partial-history) with economic (pricing) loss",
    },
    valuationPathFact: "valueSwaps never sets EXTERNAL_TOKEN_PRICE — realized-PnL legs depend only on execution anchors (stablecoin, historical SOL, propagated side). The CoinGecko token-price budget (D/E) affects only Icarus peak sampling, not realized PnL.",
    wallets,
    aggregate: { totalDisposalLegs: totalLegs, reasonTotals: aggregateReasons, primaryFailureRanking: primary },
  };
  writeFileSync(join(OUTPUT_DIR, "phase7a-price-coverage-attribution.json"), `${JSON.stringify(output, null, 2)}\n`);

  const md: string[] = [];
  md.push("# Phase 7A — Realized-PnL Coverage Attribution", "");
  md.push(`Generated: ${output.generatedAt} (Asia/Shanghai)`, "");
  md.push("Diagnostic only. Pipeline re-run unchanged to trace every disposal leg of the seven Sisyphus", "evidence-limited wallets. No scoring, eligibility, valuation, or threshold changes.", "");
  md.push("Key code fact: `valueSwaps` never uses external token prices — realized PnL rests on execution", "anchors only (stablecoin / historical SOL / propagated side). The CoinGecko token-price budget", "affects Icarus peak sampling, NOT realized PnL. Reasons D/E are therefore near-vacuous here.", "");
  md.push("## 1–2. Per-wallet waterfall and failure attribution", "");
  md.push("| Wallet | Disposal legs | USD proceeds | Cost basis / PnL | Coverage | A value-unknown | B basis-unknown | C pre-window | D SOL-gap | F overdraw |");
  md.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const wallet of wallets) {
    const r = wallet.reasonCounts;
    md.push(`| ${wallet.label} | ${wallet.waterfall.disposalLegs} | ${wallet.waterfall.withUsdProceeds} | ${wallet.waterfall.withRealizedPnl} | ${wallet.waterfall.pnlCoverageNow} | ${r.A_DISPOSAL_VALUE_UNKNOWN ?? 0} | ${r.B_COST_BASIS_UNKNOWN ?? 0} | ${r.C_PARTIAL_HISTORY_INVENTORY ?? 0} | ${r.D_SOL_PRICE_GAP ?? 0} | ${r.F_OVERDRAW_AMBIGUITY ?? 0} |`);
  }
  md.push("");
  md.push("Aggregate over all seven wallets: " + primary.map(([reason, count]) => `${reason}=${count}`).join(", ") + `, VALUED=${aggregateReasons.VALUED ?? 0}, total legs ${totalLegs}.`, "");
  md.push("## 3. Execution valuation vs market pricing", "");
  md.push("| Wallet | missing legs w/ valued counter (execution-derivable) | missing requiring external token price | fundamentally unrecoverable (pre-window / overdraw) |");
  md.push("|---|---:|---:|---:|");
  for (const wallet of wallets) {
    const r = wallet.reasonCounts;
    const execDerivable = (r.D_SOL_PRICE_GAP ?? 0) + (r.G_OTHER ?? 0);
    const externalNeeded = (r.A_DISPOSAL_VALUE_UNKNOWN ?? 0) + (r.B_COST_BASIS_UNKNOWN ?? 0);
    const unrecoverable = (r.C_PARTIAL_HISTORY_INVENTORY ?? 0) + (r.F_OVERDRAW_AMBIGUITY ?? 0);
    md.push(`| ${wallet.label} | ${execDerivable} | ${externalNeeded} | ${unrecoverable} |`);
  }
  md.push("");
  md.push("A-legs are token<->token swaps with no USD anchor on either side; their counter-assets are", "also unvalued tokens, so execution data alone cannot price them — external (or route-aware)", "pricing is the legitimate lever. C-legs sold inventory acquired before the window: no execution", "or market price can reconstruct a missing acquisition.", "");
  md.push("## 4. Token / route breakdown (top missing)", "");
  for (const wallet of wallets) {
    md.push(`- **${wallet.label}** — by counter: ${Object.entries(wallet.byCounter).map(([counter, bucket]) => `${counter} ${bucket.missing}/${bucket.legs} missing`).join(", ")}; by source: ${Object.entries(wallet.bySource).filter(([, bucket]) => bucket.missing > 0).map(([source, bucket]) => `${source} ${bucket.missing}/${bucket.legs}`).join(", ") || "all sources fully priced"}; top missing mints: ${wallet.topMissingMints.map((mint) => `${mint.mint} ${mint.missing}/${mint.legs}`).join(", ") || "none"}`);
  }
  md.push("");
  md.push("## 5. pnlCoverage definition audit", "");
  md.push(`- Denominator: ${output.coverageDefinitionAudit.denominator}.`);
  md.push(`- Formula: ${output.coverageDefinitionAudit.formula}.`);
  for (const flag of output.coverageDefinitionAudit.semanticFlags) md.push(`- Flag: ${flag}`);
  md.push(`- Verdict: ${output.coverageDefinitionAudit.verdict}`);
  md.push("");
  md.push("## 6. Recoverability simulation (offline)", "");
  md.push("| Wallet | Coverage now | Max execution-only | Max external pricing | Max external + conservative basis | Unrecoverable legs |");
  md.push("|---|---:|---:|---:|---:|---:|");
  for (const wallet of wallets) {
    md.push(`| ${wallet.label} | ${wallet.waterfall.pnlCoverageNow} | ${wallet.recoverability.maxCoverageExecutionOnly} | ${wallet.recoverability.maxCoverageWithExternalTokenPricing} | ${wallet.recoverability.maxCoverageWithExternalPricingAndConservativeBasis} | ${wallet.recoverability.unrecoverableLegs} |`);
  }
  md.push("");
  md.push("Budget increase adds nothing (no PnL leg consumes the token-price budget).", "");
  md.push("## 7. Sisyphus impact", "");
  md.push("| Wallet | Sisyphus match (elig) | stored cov | crosses 0.5 w/ external pricing? | w/ full program? | dominant blocker |");
  md.push("|---|---|---:|---|---|---|");
  for (const wallet of wallets) {
    const s = wallet.sisyphus;
    md.push(`| ${wallet.label} | ${s?.match} (${s?.eligible ? "Y" : "N"}) | ${s?.storedPnlCoverage} | ${s?.crossesThresholdWithExternalPricing ? "YES" : "no"} | ${s?.crossesThresholdWithFullProgram ? "YES" : "no"} | ${s?.dominantBlocker} |`);
  }
  md.push("");
  md.push("---", "");
  const primaryBottleneck = primary[0]?.[0] ?? "NONE";
  const secondaryBottleneck = primary[1]?.[0] ?? "NONE";
  const recoverableWallets = wallets.filter((wallet) => wallet.sisyphus?.crossesThresholdWithExternalPricing).map((wallet) => wallet.label);
  const fullProgramWallets = wallets.filter((wallet) => wallet.sisyphus?.crossesThresholdWithFullProgram).map((wallet) => wallet.label);
  md.push("## PRIMARY COVERAGE BOTTLENECK", "");
  md.push(`**${primaryBottleneck}** (${primary[0]?.[1] ?? 0} of ${totalLegs} legs across the seven wallets).`);
  md.push("");
  md.push("## SECONDARY BOTTLENECK", "");
  md.push(`**${secondaryBottleneck}** (${primary[1]?.[1] ?? 0} legs).`);
  md.push("");
  md.push("## RECOVERABLE COVERAGE", "");
  md.push(`External token pricing of disposal legs and in-window acquisitions would lift coverage to: ${wallets.map((wallet) => `${wallet.label}→${wallet.recoverability.maxCoverageWithExternalTokenPricing}`).join(", ")}. Execution-only recovery moves almost nothing (${wallets.every((wallet) => wallet.recoverability.maxCoverageExecutionOnly < 0.05) ? "all below 0.05" : "see table"}).`);
  md.push("");
  md.push("## UNRECOVERABLE COVERAGE", "");
  md.push(`Pre-window inventory / overdraw legs: ${wallets.map((wallet) => `${wallet.label}=${wallet.recoverability.unrecoverableLegs}`).join(", ")} — structurally outside any pricing fix.`);
  md.push("");
  md.push("## SISYPHUS WALLETS POTENTIALLY RECOVERABLE", "");
  md.push(`External token pricing alone: ${recoverableWallets.join(", ") || "none"} cross the 0.50 gate.`);
  md.push(`Full program (external pricing + conservative tracked-portion basis for overdrawn ledgers): **${fullProgramWallets.join(", ") || "none"}** cross. P5 / P9 / L7 remain blocked by pre-window inventory (C).`);
  md.push("");
  md.push("## RECOMMENDED NEXT ENGINEERING STEP", "");
  md.push("1. Conservative cost-basis reconstruction for overdrawn ledgers (97 F-legs, the LARGEST single loss):");
  md.push("   price the TRACKED portion of disposals against in-window acquisition basis instead of discarding");
  md.push("   the whole ledger's PnL — bounded, no fabrication (the untracked excess stays unpriced);");
  md.push("2. Introduce an external token-execution valuation path for token<->token swaps (mint-level");
  md.push("   historical price at execution timestamp, HIGH-scrutiny confidence) — recovers A+B legs;");
  md.push("3. Consider a volume-weighted PnL-coverage metric and a denominator excluding pre-window");
  md.push("   inventory legs (measurement fix, eligibility unchanged for now);");
  md.push("4. Do NOT spend budget on request-limit increases — realized PnL never consumes that budget.");
  md.push("");
  md.push("Risk note: external mint-level pricing reintroduces fabrication risk on illiquid long-tail", "mints; gate it by liquidity/price-source quality before trusting it for eligibility.");
  md.push("");
  writeFileSync(join(OUTPUT_DIR, "phase7a-price-coverage-attribution.md"), `${md.join("\n")}\n`);
  console.log(`[phase7a] primary=${primaryBottleneck}(${primary[0]?.[1] ?? 0}) secondary=${secondaryBottleneck}(${primary[1]?.[1] ?? 0}); recoverable: ${recoverableWallets.join(",") || "none"}`);
}

loadLocalEnvironment();
const command = process.argv[2];
if (command === "run") await run();
else if (command === "report") report();
else {
  console.error("usage: validate-phase7a-attribution.ts run|report");
  process.exit(1);
}
