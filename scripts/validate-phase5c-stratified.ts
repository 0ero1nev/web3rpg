// Phase 5C — behavior-stratified trader calibration sample.
//
//   discover — Stage 1: harvest feePayers (self-initiating traders only) from
//              recent on-chain activity of known high-frequency mints.
//              Stage 2: cheap pre-screen (ONE 100-tx history request per
//              candidate) bucketing swap-like self-initiated activity:
//              HIGH >= 50, MED 10-49, LOW 3-9 in the first 100 txs.
//              Writes stratified-candidates.json.
//   run      — full unchanged pipeline over screened candidates (HIGH first,
//              then MED, then LOW, capped), appending to
//              stratified-results.jsonl (resume-safe).
//   select   — pick the final 40 by OUR OWN engine metrics only:
//              10 highest qualifyingSwaps, 10 highest realized PnL,
//              10 lowest/most negative realized PnL, 10 mid-activity.
//              Inclusion requires qualifyingSwaps >= 10. Writes
//              stratified-dataset.json + stratified-report.md.
//
// Note: leaderboard APIs (Birdeye / Solana Tracker) require keys we do not
// have, and their web leaderboards are client-side. Discovery is therefore
// on-chain via Helius; per the calibration rule, external/discovery data only
// finds candidates — every stratum boundary below is decided by this repo's
// own parser, valuation, and persona engine.

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
const CANDIDATES_PATH = join(OUTPUT_DIR, "stratified-candidates.json");
const RESULTS_PATH = join(OUTPUT_DIR, "stratified-results.jsonl");
const PREV_DATASET_PATH = join(OUTPUT_DIR, "dataset.json");
const PREV_RESULTS_PATH = join(OUTPUT_DIR, "phase5b-results.jsonl");
const DISCOVERY_MINTS = [
  ["pump-c", "6ehEcTMCc85aNF4x9CWx8HuvWGhxQtvKdhKVf2HDpump"],
  ["pump-a", "98kfF7rmsg1QDUEoCqNE7g7M1FdrTt92TEp2CLzypump"],
  ["pump-b", "Hg5Ja55T5wESq4vyFoiVCMeHXtGyVA69X2UHq8hgpump"],
  ["meta-d", "BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta"],
  ["jup", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"],
  ["pump-major", "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn"],
] as const;
const MAX_ANALYSES = 169;
const WALLET_PAUSE_MS = 8_000;
const SCREEN_PAUSE_MS = 250;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function isValidSolanaPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 44) return false;
  let number = BigInt(0);
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    number = number * BigInt(58) + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > BigInt(0)) {
    bytes.push(Number(number % BigInt(256)));
    number /= BigInt(256);
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.push(0);
  }
  return bytes.length === 32;
}

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function heliusGet(path: string, params: Record<string, string>) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error("HELIUS_API_KEY missing");
  const url = new URL(`https://api.helius.xyz${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { "X-Api-Key": apiKey }, cache: "no-store" });
  if (!response.ok) throw new Error(`Helius ${path} -> HTTP ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

type Candidate = { address: string; source: string; screenedSwapLike: number; screenedTxs: number; bucket: "HIGH" | "MED" | "LOW" | "DROP" };

async function discover() {
  const previous = new Set(
    (JSON.parse(readFileSync(PREV_DATASET_PATH, "utf8")) as { entries: Array<{ address: string }> })
      .entries.map((entry) => entry.address),
  );
  const excluded = new Set<string>([...previous, ...DISCOVERY_MINTS.map(([, mint]) => mint)]);
  const pools: Array<{ source: string; feePayers: string[] }> = [];
  for (const [source, mint] of DISCOVERY_MINTS) {
    const payload = await heliusGet(`/v0/addresses/${mint}/transactions`, { limit: "100" });
    const transactions = Array.isArray(payload) ? payload : [];
    const feePayers = new Set<string>();
    for (const transaction of transactions as Array<Record<string, unknown>>) {
      const feePayer = transaction.feePayer;
      if (isValidSolanaPublicKey(feePayer) && !excluded.has(feePayer)) feePayers.add(feePayer);
    }
    pools.push({ source, feePayers: [...feePayers] });
    console.log(`[discover] ${source}: ${transactions.length} txs -> ${feePayers.size} unique feePayers`);
    await sleep(SCREEN_PAUSE_MS);
  }
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const pool of pools) {
    for (const address of pool.feePayers) {
      if (seen.has(address)) continue;
      seen.add(address);
      candidates.push({ address, source: pool.source, screenedSwapLike: -1, screenedTxs: 0, bucket: "LOW" });
    }
  }
  console.log(`[discover] screening ${candidates.length} unique feePayers (1 page each)`);
  const dropped: Array<{ address: string; source: string; screenedSwapLike: number }> = [];
  for (const [index, candidate] of candidates.entries()) {
    try {
      const payload = await heliusGet(`/v1/wallet/${candidate.address}/history`, { limit: "100" });
      const transactions = (payload.data ?? []) as Array<Record<string, unknown>>;
      let swapLike = 0;
      for (const transaction of transactions) {
        const changes = (transaction.balanceChanges ?? []) as Array<{ amount: number }>;
        const selfInitiated = transaction.feePayer === candidate.address;
        const bothSides = changes.some((change) => change.amount > 0) && changes.some((change) => change.amount < 0);
        if (selfInitiated && bothSides) swapLike += 1;
      }
      candidate.screenedSwapLike = swapLike;
      candidate.screenedTxs = transactions.length;
      candidate.bucket = swapLike >= 50 ? "HIGH" : swapLike >= 10 ? "MED" : swapLike >= 3 ? "LOW" : "DROP";
      if (candidate.bucket === "DROP") dropped.push({ address: candidate.address, source: candidate.source, screenedSwapLike: swapLike });
    } catch (error) {
      console.log(`[discover] screen failed for ${candidate.address.slice(0, 8)}: ${error instanceof Error ? error.message : error}`);
    }
    if (index % 20 === 19) console.log(`[discover] screened ${index + 1}/${candidates.length}`);
    await sleep(SCREEN_PAUSE_MS);
  }
  const kept = candidates.filter((candidate) => candidate.bucket !== "DROP");
  const counts = { HIGH: kept.filter((c) => c.bucket === "HIGH").length, MED: kept.filter((c) => c.bucket === "MED").length, LOW: kept.filter((c) => c.bucket === "LOW").length };
  writeFileSync(CANDIDATES_PATH, `${JSON.stringify({ discoveredAt: new Date().toISOString(), counts, kept, droppedCount: dropped.length }, null, 2)}\n`);
  console.log(`[discover] buckets: ${JSON.stringify(counts)}, dropped ${dropped.length} -> ${CANDIDATES_PATH}`);
}

async function analyzeWallet(candidate: Candidate) {
  const startedAt = Date.now();
  const raw = await fetchHeliusWalletData(candidate.address, MAX_TRANSACTIONS);
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
    address: candidate.address,
    source: candidate.source,
    bucket: candidate.bucket,
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
    winner: ranking.winner
      ? { personaId: ranking.winner.personaId, match: ranking.winner.match, confidence: ranking.winner.confidence }
      : null,
    winnerMargin: ranking.winner && ranking.runnerUp
      ? (ranking.winner.match ?? 0) - (ranking.runnerUp.match ?? 0)
      : null,
    donQuixoteStrongest: (() => {
      const open = positionPerformance.positions.filter((position) => position.status === "OPEN");
      const losing = open
        .filter((position) => position.entryPriceUsd !== null && position.currentPriceUsd !== null && (position.unrealizedReturnPct ?? 0) < 0)
        .sort((left, right) => (left.unrealizedReturnPct ?? 0) - (right.unrealizedReturnPct ?? 0))[0];
      return losing ? {
        returnPct: losing.unrealizedReturnPct,
        days: losing.holdingDuration === null ? null : Number((losing.holdingDuration / 86_400).toFixed(1)),
        match: ranking.scores.find((score) => score.personaId === "don_quixote")?.match ?? null,
      } : null;
    })(),
    icarus: {
      eligibleEpisodes: priceValidation.historical.historicalPriceEligibleEpisodes,
      pricedEpisodes: priceValidation.historical.historicalPricePricedEpisodes,
      candidates: priceValidation.icarusCandidates.slice(0, 3),
    },
    cost: {
      externalRequests: positionPerformance.costReport.externalRequests,
      providerFailures: positionPerformance.costReport.providerFailures,
      unsupportedMints: positionPerformance.costReport.unsupportedTokens,
    },
  };
}

async function run() {
  const candidates = (JSON.parse(readFileSync(CANDIDATES_PATH, "utf8")) as { kept: Candidate[] }).kept;
  // Round-robin across activity buckets so every stratum has representation
  // within the analysis cap, instead of exhausting the cap on HIGH alone.
  const pools = (["HIGH", "MED", "LOW"] as const).map((bucket) =>
    candidates.filter((candidate) => candidate.bucket === bucket));
  const ordered: Candidate[] = [];
  for (let index = 0; ordered.length < MAX_ANALYSES; index += 1) {
    let advanced = false;
    for (const pool of pools) {
      if (ordered.length >= MAX_ANALYSES) break;
      if (index < pool.length) {
        ordered.push(pool[index]);
        advanced = true;
      }
    }
    if (!advanced) break;
  }
  const limited = ordered;
  const done = new Set<string>(
    existsSync(RESULTS_PATH)
      ? readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
        try { return (JSON.parse(line) as { address: string; error?: string }).address; } catch { return ""; }
      }).filter(Boolean)
      : [],
  );
  console.log(`[run] ${limited.length} candidates queued (HIGH first), ${done.size} already done`);
  for (const [index, candidate] of limited.entries()) {
    if (done.has(candidate.address)) continue;
    try {
      const result = await analyzeWallet(candidate);
      appendFileSync(RESULTS_PATH, `${JSON.stringify(result)}\n`);
      console.log(`[run ${index + 1}/${limited.length}] ${candidate.bucket} ${candidate.address.slice(0, 8)} qSwaps=${result.qualifyingSwaps} pnl=${result.behavior.realizedPnlUsd} winner=${result.winner ? `${result.winner.personaId}@${result.winner.match}` : `NONE(${result.resultReason})`}`);
    } catch (error) {
      appendFileSync(RESULTS_PATH, `${JSON.stringify({ address: candidate.address, bucket: candidate.bucket, error: error instanceof Error ? error.message : String(error) })}\n`);
      console.log(`[run] ${candidate.address.slice(0, 8)} FAILED: ${error instanceof Error ? error.message : error}`);
    }
    await sleep(WALLET_PAUSE_MS);
  }
  console.log("[run] complete");
}

type RunResult = Awaited<ReturnType<typeof analyzeWallet>>;

function select() {
  const lines = readFileSync(RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const analyzed = lines.filter((line) => !line.error) as unknown as Array<RunResult & { address: string; bucket: string }>;
  const failures = lines.filter((line) => line.error);
  const eligiblePool = analyzed.filter((result) => result.qualifyingSwaps >= 10);
  const chosen: Array<{ label: string; result: typeof eligiblePool[number]; stratum: string }> = [];
  const used = new Set<string>();
  const take = (stratum: string, ordered: typeof eligiblePool, count: number) => {
    let taken = 0;
    for (const result of ordered) {
      if (taken >= count) break;
      if (used.has(result.address)) continue;
      used.add(result.address);
      chosen.push({ label: `${stratum[0]}${taken + 1}`, result, stratum });
      taken += 1;
    }
    return taken;
  };
  const bySwaps = eligiblePool.slice().sort((a, b) => b.qualifyingSwaps - a.qualifyingSwaps);
  const withPnl = eligiblePool.filter((result) => result.behavior.realizedPnlUsd !== null);
  const byPnlHigh = withPnl.slice().sort((a, b) => (b.behavior.realizedPnlUsd ?? 0) - (a.behavior.realizedPnlUsd ?? 0));
  const byPnlLow = withPnl.slice().sort((a, b) => (a.behavior.realizedPnlUsd ?? 0) - (b.behavior.realizedPnlUsd ?? 0));
  const swapsValues = eligiblePool.map((result) => result.qualifyingSwaps).sort((a, b) => a - b);
  const medianSwaps = swapsValues.length > 0 ? swapsValues[Math.floor(swapsValues.length / 2)] : 0;
  const midBand = eligiblePool
    .filter((result) => result.qualifyingSwaps >= medianSwaps * 0.5 && result.qualifyingSwaps <= medianSwaps * 2)
    .sort((a, b) => a.qualifyingSwaps - b.qualifyingSwaps);
  const filled = {
    TRADE_COUNT: take("T", bySwaps, 10),
    PNL_HIGH: take("P", byPnlHigh, 10),
    PNL_LOW: take("L", byPnlLow, 10),
    MID_ACTIVITY: take("M", midBand, 10),
  };
  const shortfall = 40 - chosen.length;
  if (shortfall > 0) take("F", eligiblePool.slice().sort((a, b) => b.qualifyingSwaps - a.qualifyingSwaps), shortfall);

  const datasetEntries = chosen.map((entry) => ({
    label: entry.label,
    address: entry.result.address,
    source: entry.result.source,
    stratum: entry.stratum,
    discoveryBucket: entry.result.bucket,
    qualifyingSwaps: entry.result.qualifyingSwaps,
    realizedPnlUsd: entry.result.behavior.realizedPnlUsd,
    pnlCoverage: entry.result.behavior.pnlCoverage,
  }));
  writeFileSync(join(OUTPUT_DIR, "stratified-dataset.json"), `${JSON.stringify({ selectedAt: new Date().toISOString(), filled, analyzedCount: analyzed.length, failuresCount: failures.length, entries: datasetEntries }, null, 2)}\n`);

  const personaIds = ["sisyphus", "newton", "caesar", "croesus", "icarus", "midas", "don_quixote", "napoleon"];
  const strataReport = ["T", "P", "L", "M", "F"].map((prefix) => {
    const members = chosen.filter((entry) => entry.stratum[0] === prefix);
    if (members.length === 0) return null;
    const results = members.map((entry) => entry.result);
    const winners = Object.fromEntries(personaIds.map((id) => [id, results.filter((r) => r.winner?.personaId === id).length]));
    return {
      stratum: members[0].stratum,
      count: members.length,
      qualifyingSwaps: { min: Math.min(...results.map((r) => r.qualifyingSwaps)), max: Math.max(...results.map((r) => r.qualifyingSwaps)) },
      realizedPnlUsd: { min: Math.min(...results.map((r) => r.behavior.realizedPnlUsd ?? 0)), max: Math.max(...results.map((r) => r.behavior.realizedPnlUsd ?? 0)) },
      assigned: results.filter((r) => r.winner).length,
      noStrongMatch: results.filter((r) => r.resultReason === "NO_STRONG_MATCH").length,
      insufficient: results.filter((r) => r.resultReason === "INSUFFICIENT_HISTORY").length,
      donQuixote: {
        nonZero: results.filter((r) => (r.personas.don_quixote.match ?? 0) > 0).length,
        eligible: results.filter((r) => r.personas.don_quixote.eligible).length,
        wins: results.filter((r) => r.winner?.personaId === "don_quixote").length,
      },
      winners,
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const previous = readFileSync(PREV_RESULTS_PATH, "utf8").split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as { winner?: { personaId: string } | null; personas?: Record<string, { match: number | null; eligible: boolean }>; resultReason?: string | null; error?: string })
    .filter((line) => !line.error);
  const previousStats = {
    assigned: previous.filter((row) => row.winner).length,
    total: previous.length,
    donQuixoteNonZero: previous.filter((row) => (row.personas?.don_quixote.match ?? 0) > 0).length,
  };
  const newResults = chosen.map((entry) => entry.result);
  const overall = {
    assigned: newResults.filter((r) => r.winner).length,
    total: newResults.length,
    winnerDistribution: Object.fromEntries(personaIds.map((id) => [id, newResults.filter((r) => r.winner?.personaId === id).length])),
    noStrongMatch: newResults.filter((r) => r.resultReason === "NO_STRONG_MATCH").length,
    donQuixote: {
      nonZero: newResults.filter((r) => (r.personas.don_quixote.match ?? 0) > 0).length,
      eligible: newResults.filter((r) => r.personas.don_quixote.eligible).length,
      wins: newResults.filter((r) => r.winner?.personaId === "don_quixote").length,
    },
    icarusMeasurable: newResults.filter((r) => r.personas.icarus.match !== null).length,
    icarusWins: newResults.filter((r) => r.winner?.personaId === "icarus").length,
  };
  writeFileSync(join(OUTPUT_DIR, "stratified-summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), filled, overall, strataReport, previousStats, datasetEntries }, null, 2)}\n`);

  const report: string[] = [];
  report.push("# Phase 5C — Behavior-Stratified Trader Calibration (40 wallets)", "");
  report.push(`Generated: ${new Date().toISOString()} (Asia/Shanghai)`, "");
  report.push("Sampling: candidates discovered on-chain as feePayers of recently-active mints (no");
  report.push("leaderboard API keys available; leaderboard data was only ever going to be a discovery");
  report.push("aid anyway). Strata are decided EXCLUSIVELY by this repo's own engine, and every");
  report.push("included wallet passes qualifyingSwaps >= 10. Pipeline and scoring: Phase 5B state, unchanged.", "");
  report.push(`Screened pool: ${analyzed.length} fully analyzed (${failures.length} failures); ${eligiblePool.length} passed qualifyingSwaps >= 10.`, "");
  report.push("## Strata fill", "");
  report.push("| Stratum | Target | Filled |", "|---|---:|---:|");
  report.push(`| T — highest trade count | 10 | ${filled.TRADE_COUNT} |`);
  report.push(`| P — highest realized PnL | 10 | ${filled.PNL_HIGH} |`);
  report.push(`| L — lowest realized PnL | 10 | ${filled.PNL_LOW} |`);
  report.push(`| M — mid activity | 10 | ${filled.MID_ACTIVITY} |`);
  report.push(`| F — fallback fill | — | ${chosen.filter((entry) => entry.stratum[0] === "F").length} |`);
  report.push("");
  report.push("## Per-stratum results", "");
  for (const stratum of strataReport) {
    report.push(`### ${stratum.stratum} (n=${stratum.count}, qualifyingSwaps ${stratum.qualifyingSwaps.min}–${stratum.qualifyingSwaps.max}, PnL $${stratum.realizedPnlUsd.min.toFixed(0)}…$${stratum.realizedPnlUsd.max.toFixed(0)})`, "");
    report.push(`- Assigned: ${stratum.assigned}/${stratum.count}; NO_STRONG_MATCH: ${stratum.noStrongMatch}; INSUFFICIENT_HISTORY: ${stratum.insufficient}`);
    report.push(`- Don Quixote: non-zero ${stratum.donQuixote.nonZero}, eligible ${stratum.donQuixote.eligible}, wins ${stratum.donQuixote.wins}`);
    const winnersText = Object.entries(stratum.winners).filter(([, count]) => count > 0).map(([id, count]) => `${id}×${count}`).join(", ") || "none";
    report.push(`- Winners: ${winnersText}`, "");
  }
  report.push("## Overall vs the Phase 5/5B 44-wallet set", "");
  report.push("| Metric | 44-wallet set | This 40-wallet trader set |");
  report.push("|---|---:|---:|");
  report.push(`| Assigned winner | ${previousStats.assigned}/${previousStats.total} | ${overall.assigned}/${overall.total} |`);
  report.push(`| Don Quixote non-zero | ${previousStats.donQuixoteNonZero}/${previousStats.total} | ${overall.donQuixote.nonZero}/${overall.total} |`);
  report.push(`| Icarus measurable / wins | — | ${overall.icarusMeasurable}/${overall.total} measurable, ${overall.icarusWins} wins |`);
  report.push("");
  report.push(`Winner distribution: ${Object.entries(overall.winnerDistribution).filter(([, c]) => c > 0).map(([id, c]) => `${id}×${c}`).join(", ") || "none"}.`);
  report.push("");
  report.push("Raw per-wallet results: stratified-results.jsonl; dataset: stratified-dataset.json;");
  report.push("aggregates: stratified-summary.json.", "");
  writeFileSync(join(OUTPUT_DIR, "stratified-report.md"), `${report.join("\n")}\n`);
  console.log(`[select] ${chosen.length} wallets selected -> stratified-dataset.json, stratified-report.md`);
}

loadLocalEnvironment();
const command = process.argv[2];
if (command === "discover") {
  await discover();
} else if (command === "run") {
  await run();
} else if (command === "select") {
  select();
} else {
  console.error("usage: validate-phase5c-stratified.ts discover|run|select");
  process.exit(1);
}
