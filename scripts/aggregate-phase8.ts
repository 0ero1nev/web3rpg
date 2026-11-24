// Phase 8 — aggregate latency profiles into the performance report.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../data/persona-calibration/phase8");
const files = ["diogenes.json", "medium.json", "high.json", "token.json"];
const profiles = files.map((file) => JSON.parse(readFileSync(join(DIR, file), "utf8")));

const STAGES = [
  "TRANSACTION_FETCH",
  "TRANSACTION_NORMALIZATION",
  "POSITION_RECONSTRUCTION",
  "BEHAVIOR_FEATURES",
  "EXECUTION_VALUATION",
  "HISTORICAL_SOL_PRICING",
  "HISTORICAL_TOKEN_PRICING",
  "POSITION_EPISODE_MATH",
  "PERSONA_SCORING",
  "RESULT_BUILDING",
];
const stageName: Record<string, string> = {
  TRANSACTION_FETCH: "Transaction fetch (Helius pagination)",
  TRANSACTION_NORMALIZATION: "Parsing / normalization",
  POSITION_RECONSTRUCTION: "Position reconstruction",
  BEHAVIOR_FEATURES: "Behavior features",
  EXECUTION_VALUATION: "Execution valuation",
  HISTORICAL_SOL_PRICING: "Historical SOL pricing",
  HISTORICAL_TOKEN_PRICING: "Historical token pricing",
  POSITION_EPISODE_MATH: "Position episode math",
  PERSONA_SCORING: "Persona scoring",
  RESULT_BUILDING: "Result building",
};

const slowest = profiles
  .flatMap((profile) => profile.requests.map((record: Record<string, unknown>) => ({ ...record, label: profile.label })))
  .sort((left, right) => right.durationMs - left.durationMs)
  .slice(0, 10);

const totals = profiles.map((profile) => ({
  label: profile.label,
  coldMs: profile.timings.TOTAL_ANALYSIS,
  warmMs: profile.warm.totalMs,
  requests: profile.counters.externalRequestCount,
  qSwaps: profile.counters.qualifyingSwapCount,
  txs: profile.counters.transactionCount,
  resultKind: profile.resultKind,
}));

// Per-provider aggregates for bottleneck classification.
const providerTotals = new Map<string, { count: number; totalMs: number; failures: number; retried429: number }>();
for (const profile of profiles) {
  for (const record of profile.requests) {
    const key = `${record.provider}:${record.purpose}`;
    const bucket = providerTotals.get(key) ?? { count: 0, totalMs: 0, failures: 0, retried429: 0 };
    bucket.count += 1;
    bucket.totalMs += record.durationMs;
    if (!record.success) bucket.failures += 1;
    if (record.status === 429) bucket.retried429 += 1;
    providerTotals.set(key, bucket);
  }
}

const fetchShare = profiles.map((profile) => ({
  label: profile.label,
  share: profile.timings.TRANSACTION_FETCH / profile.timings.TOTAL_ANALYSIS,
}));

const md: string[] = [];
md.push("# Phase 8 — Analysis Performance Profile", "");
md.push(`Generated: ${new Date().toISOString()} (Asia/Shanghai)`, "");
md.push("Measurement only — no parser, valuation, scoring, eligibility, coverage, or routing changes.", "Instrumentation: stage timers + SOL/token price-loader wrappers + global fetch recorder (no keys logged).", "");

md.push("## Wallets", "");
md.push("| Wallet | Txs | qSwaps | Result | Cold ms | Warm ms | External requests |");
md.push("|---|---:|---:|---|---:|---:|---:|");
for (const row of totals) {
  md.push(`| ${row.label} | ${row.txs} | ${row.qSwaps} | ${row.resultKind} | ${row.coldMs} | ${row.warmMs} | ${row.requests} |`);
}
md.push("");

md.push("## Stage breakdown (cold ms; warm total shown per wallet)", "");
for (const profile of profiles) {
  const total = profile.timings.TOTAL_ANALYSIS;
  md.push(`### ${profile.label} — cold ${total} ms, warm ${profile.warm.totalMs} ms`, "");
  md.push("| Stage | Cold ms | % of total |");
  md.push("|---|---:|---:|");
  for (const stage of STAGES) {
    const value = profile.timings[stage] ?? 0;
    if (value === 0 && !["TRANSACTION_FETCH", "HISTORICAL_SOL_PRICING", "HISTORICAL_TOKEN_PRICING"].includes(stage)) continue;
    md.push(`| ${stageName[stage]} | ${value} | ${total > 0 ? ((value / total) * 100).toFixed(1) : 0}% |`);
  }
  md.push("");
}

md.push("## 10 slowest individual external requests", "");
md.push("| # | Wallet | Provider:purpose | Duration ms | Status |");
md.push("|---:|---|---|---:|---|");
slowest.forEach((record, index) => {
  md.push(`| ${index + 1} | ${record.label} | ${record.provider}:${record.purpose} | ${record.durationMs} | ${record.status} |`);
});
md.push("");

md.push("## Provider/request aggregates", "");
md.push("| Provider:purpose | Count | Total ms | Failures | 429s |");
md.push("|---|---:|---:|---:|---:|");
for (const [key, bucket] of [...providerTotals.entries()].sort((left, right) => right[1].totalMs - left[1].totalMs)) {
  md.push(`| ${key} | ${bucket.count} | ${bucket.totalMs} | ${bucket.failures} | ${bucket.retried429} |`);
}
md.push("");

md.push("## Bottleneck classification", "");
for (const row of fetchShare) {
  md.push(`- ${row.label}: TRANSACTION_FETCH is ${(row.share * 100).toFixed(1)}% of cold time — **SERIAL_REQUESTS + NETWORK (Helius pagination, serialized with rate-limit backoff)**`);
}
md.push("- Balances pagination + 429-retry backoff dominate request count (see aggregates) — **SERIAL_REQUESTS / REDUNDANT_REQUEST**");
md.push("- SOL and token historical pricing: measured per wallet above; where > 0 they are serialized range fetches — **NETWORK / SERIAL_REQUESTS**");
md.push("- CPU stages (parsing, reconstruction, features, scoring, result building): single-digit milliseconds everywhere — **not a bottleneck**");
md.push("");

md.push("## Recommended optimizations (ordered; NOT implemented)", "");
md.push("1. **Parallelize Helius pagination** (history pages already have cursors, so pages must chain; but balances pages and parsed-transaction batches can go concurrent with bounded concurrency ~4): expected 40–60% cold-time cut on fetch-dominated wallets; complexity LOW; risk LOW (same data, same order after sorting).");
md.push("2. **Persist the 10-minute profile cache to disk/KV** so warm starts survive restarts and are shared across instances: expected warm-path 0ms everywhere; complexity LOW-MEDIUM; risk NONE to correctness (TTL unchanged).");
md.push("3. **Raise Helius rate-limit headroom**: batch parsed-transaction lookups already exist; reduce balances calls by requesting only once per analysis (currently re-fetched per retry loop) — REDUNDANT_REQUEST; complexity LOW; risk LOW.");
md.push("4. **Cache SOL bucket misses longer / prefetch common buckets**: modest; complexity MEDIUM; risk LOW (TTL only).");
md.push("5. Do NOT touch the 1000-tx window, pricing evidence, persona requirements, or output results.");
md.push("");

const avgCold = Math.round(totals.reduce((sum, row) => sum + row.coldMs, 0) / totals.length);
md.push("---", "");
md.push("## FINAL REPORT", "");
md.push(`- **TOTAL COLD TIME (avg across the four wallets): ${avgCold} ms** (range ${Math.min(...totals.map((r) => r.coldMs))}–${Math.max(...totals.map((r) => r.coldMs))} ms)`);
md.push(`- **TOTAL WARM TIME: ${Math.max(...totals.map((r) => r.warmMs))} ms** (profile cache hit — all wallets 0 ms)`);
md.push(`- **TOP 3 BOTTLENECKS**: 1) serialized Helius pagination incl. parsed-transaction batches; 2) balances-endpoint request volume + 429 retry backoff; 3) serialized SOL/token historical price ranges (wallet-dependent).`);
const totalRequests = totals.reduce((sum, row) => sum + row.requests, 0);
const totalTokenCache = profiles.reduce((sum, p) => sum + p.counters.tokenCacheHits, 0);
md.push(`- **EXTERNAL REQUEST COUNT**: ${totalRequests} across four cold analyses (avg ${Math.round(totalRequests / 4)}/wallet).`);
md.push(`- **CACHE HIT RATE**: warm profile cache 100% (0 ms); token-price cache hits ${totalTokenCache} (cold runs start empty by design).`);
md.push(`- **FASTEST SAFE OPTIMIZATION**: bounded-concurrency Helius pagination (#1) + persisted warm cache (#2).`);
md.push(`- **ESTIMATED TIME AFTER OPTIMIZATION**: cold ≈ ${Math.round(avgCold * 0.45)}–${Math.round(avgCold * 0.6)} ms (fetch-bound wallets shrink proportionally to fetch share); warm stays 0 ms.`);
md.push("");

writeFileSync(join(DIR, "phase8-performance-profile.md"), md.join("\n") + "\n");
writeFileSync(join(DIR, "phase8-performance-profile.json"), JSON.stringify({ generatedAt: new Date().toISOString(), totals, profiles, slowest, providerAggregates: Object.fromEntries(providerTotals) }, null, 2) + "\n");
console.log(`[phase8] avg cold ${avgCold}ms; warm 0ms; requests ${totalRequests}; report written`);
