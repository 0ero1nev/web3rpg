# Phase 8B — Helius Fetch Latency Optimization

Generated: 2026-10-07T21:22:05.968397 (Asia/Shanghai)

Fetch layer only: parsed-transaction batches now run through a bounded pool
(mapWithConcurrency, order-preserving); 429 backoff gains jitter; balances/history
stay serial (cursor/hasMore chains); request-identity telemetry added. No analysis
semantics touched (window, parser, swaps, reconstruction, valuation, scoring unchanged).

## Concurrency experiment (wallet B, cold, fresh process per run)

| Parsed concurrency | Total ms | Requests | 429s |
|---:|---:|---:|---:|
| 2 | 19403 | 21 | 0 |
| 3 | 18198 | 21 | 0 |
| 4 | 16719 | 22 | 1 |

**Selected: 3.** Concurrency 4 saved 1.5s but triggered a 429 retry on the shared
plan; correctness/reliability over maximum concurrency per phase rules.

## BEFORE vs AFTER (cold; warm after)

| Wallet | Before | After | Δ | Reqs B→A | 429 B→A | qSwaps B→A | Result B→A | Warm |
|---|---:|---:|---:|---|---|---|---|---:|
| diogenes-low | 46.0s | 38.0s | -17% | 62→58 | 22→18 | 2→2 | SPECIAL_PERSONA→SPECIAL_PERSONA | 0ms |
| medium-B | 25.7s | 18.2s | -29% | 21→21 | 0→0 | 400→400 | NORMAL_PERSONA→NORMAL_PERSONA | 0ms |
| high-C | 37.8s | 30.0s | -21% | 50→50 | 0→0 | 845→845 | NORMAL_PERSONA→NORMAL_PERSONA | 0ms |
| token-A | 30.8s | 24.2s | -21% | 42→42 | 0→0 | 560→564 | NORMAL_PERSONA→NORMAL_PERSONA | 0ms |

- **AVG COLD: 35.1s → 27.6s (21% reduction)**; warm stays 0ms.
- Result equivalence: diogenes/B/C identical on transactionCount (1000), qualifyingSwapCount and result kind;
  B's persona snapshot stable across concurrency levels (caesar@81 conf 90). token-A shows 560→564
  qualifying swaps — live trading between the two runs (window slide), not a fetch-layer effect;
  enrichment-map identity under concurrency is unit-proven (51/51 tests).
- Remaining fat: diogenes wallet 38s — balances+history serial chains with 18 429 retry backoffs
  (cursor-dependent, deliberately not parallelized); C's CoinGecko token ranges (~7s, out of scope).
- Duplicate request identities: none (telemetry + unit tests).

## FINAL REPORT

- BEFORE AVG COLD: 35.1s
- AFTER AVG COLD: 27.6s
- LATENCY REDUCTION: 21%
- SELECTED PARSED CONCURRENCY: 3 (experiment: 2/3/4)
- SELECTED BALANCE CONCURRENCY: 1 (serial — hasMore-chained pages; retries deduped + jittered only)
- REQUESTS BEFORE/AFTER: 175 → 171
- 429 BEFORE/AFTER: 22 → 18
- RETRIES BEFORE/AFTER: retry policy unchanged (failed request only, Retry-After honored, jittered); fewer retries observed overall
- DUPLICATES BEFORE/AFTER: telemetry added this phase; AFTER duplicates = 0
- RESULT EQUIVALENCE: verified (3/4 identical on recorded dims; token-A drift is live-data, documented)
- TESTS: 51/51 pass; TSC clean
- NEXT BOTTLENECK: balance/history serial chains under 429 pressure (persistent warm cache or careful prefetch next), then token-price ranges (~20% on multi-mint wallets)
