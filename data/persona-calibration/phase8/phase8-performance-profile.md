# Phase 8 — Analysis Performance Profile

Generated: 2026-10-07T11:52:27.006Z (Asia/Shanghai)

Measurement only — no parser, valuation, scoring, eligibility, coverage, or routing changes.
Instrumentation: stage timers + SOL/token price-loader wrappers + global fetch recorder (no keys logged).

## Wallets

| Wallet | Txs | qSwaps | Result | Cold ms | Warm ms | External requests |
|---|---:|---:|---|---:|---:|---:|
| diogenes-low | 1000 | 2 | SPECIAL_PERSONA | 46048 | 0 | 62 |
| medium-B | 1000 | 400 | NORMAL_PERSONA | 25685 | 0 | 21 |
| high-C | 1000 | 845 | NORMAL_PERSONA | 37757 | 0 | 50 |
| token-A | 1000 | 560 | NORMAL_PERSONA | 30759 | 0 | 42 |

## Stage breakdown (cold ms; warm total shown per wallet)

### diogenes-low — cold 46048 ms, warm 0 ms

| Stage | Cold ms | % of total |
|---|---:|---:|
| Transaction fetch (Helius pagination) | 46029 | 100.0% |
| Parsing / normalization | 3 | 0.0% |
| Position reconstruction | 8 | 0.0% |
| Execution valuation | 1 | 0.0% |
| Historical SOL pricing | 0 | 0.0% |
| Historical token pricing | 0 | 0.0% |
| Position episode math | 1 | 0.0% |
| Persona scoring | 6 | 0.0% |

### medium-B — cold 25685 ms, warm 0 ms

| Stage | Cold ms | % of total |
|---|---:|---:|
| Transaction fetch (Helius pagination) | 25655 | 99.9% |
| Parsing / normalization | 4 | 0.0% |
| Position reconstruction | 11 | 0.0% |
| Execution valuation | 3 | 0.0% |
| Historical SOL pricing | 0 | 0.0% |
| Historical token pricing | 0 | 0.0% |
| Position episode math | 1 | 0.0% |
| Persona scoring | 9 | 0.0% |

### high-C — cold 37757 ms, warm 0 ms

| Stage | Cold ms | % of total |
|---|---:|---:|
| Transaction fetch (Helius pagination) | 28036 | 74.3% |
| Parsing / normalization | 7 | 0.0% |
| Position reconstruction | 17 | 0.0% |
| Execution valuation | 4 | 0.0% |
| Historical SOL pricing | 804 | 2.1% |
| Historical token pricing | 8868 | 23.5% |
| Position episode math | 5 | 0.0% |
| Persona scoring | 12 | 0.0% |

### token-A — cold 30759 ms, warm 0 ms

| Stage | Cold ms | % of total |
|---|---:|---:|
| Transaction fetch (Helius pagination) | 24006 | 78.0% |
| Parsing / normalization | 5 | 0.0% |
| Position reconstruction | 16 | 0.1% |
| Execution valuation | 5 | 0.0% |
| Historical SOL pricing | 600 | 2.0% |
| Historical token pricing | 6105 | 19.8% |
| Position episode math | 4 | 0.0% |
| Persona scoring | 15 | 0.0% |

## 10 slowest individual external requests

| # | Wallet | Provider:purpose | Duration ms | Status |
|---:|---|---|---:|---|
| 1 | diogenes-low | helius:history-page | 3391 | 200 |
| 2 | high-C | helius:parsed-transactions | 2733 | 200 |
| 3 | medium-B | helius:history-page | 2532 | 200 |
| 4 | diogenes-low | helius:parsed-transactions | 2505 | 200 |
| 5 | diogenes-low | helius:history-page | 2436 | 200 |
| 6 | diogenes-low | helius:parsed-transactions | 2080 | 200 |
| 7 | diogenes-low | helius:parsed-transactions | 1998 | 200 |
| 8 | high-C | coingecko:token-range | 1971 | 404 |
| 9 | token-A | helius:parsed-transactions | 1943 | 200 |
| 10 | diogenes-low | helius:parsed-transactions | 1914 | 200 |

## Provider/request aggregates

| Provider:purpose | Count | Total ms | Failures | 429s |
|---|---:|---:|---:|---:|
| helius:parsed-transactions | 40 | 65849 | 0 | 0 |
| helius:history-page | 46 | 46726 | 6 | 6 |
| coingecko:token-range | 39 | 14951 | 30 | 0 |
| helius:balances | 39 | 10427 | 16 | 16 |
| coinbase:sol-range | 11 | 7641 | 0 | 0 |

## Bottleneck classification

- diogenes-low: TRANSACTION_FETCH is 100.0% of cold time — **SERIAL_REQUESTS + NETWORK (Helius pagination, serialized with rate-limit backoff)**
- medium-B: TRANSACTION_FETCH is 99.9% of cold time — **SERIAL_REQUESTS + NETWORK (Helius pagination, serialized with rate-limit backoff)**
- high-C: TRANSACTION_FETCH is 74.3% of cold time — **SERIAL_REQUESTS + NETWORK (Helius pagination, serialized with rate-limit backoff)**
- token-A: TRANSACTION_FETCH is 78.0% of cold time — **SERIAL_REQUESTS + NETWORK (Helius pagination, serialized with rate-limit backoff)**
- Balances pagination + 429-retry backoff dominate request count (see aggregates) — **SERIAL_REQUESTS / REDUNDANT_REQUEST**
- SOL and token historical pricing: measured per wallet above; where > 0 they are serialized range fetches — **NETWORK / SERIAL_REQUESTS**
- CPU stages (parsing, reconstruction, features, scoring, result building): single-digit milliseconds everywhere — **not a bottleneck**

## Recommended optimizations (ordered; NOT implemented)

1. **Parallelize Helius pagination** (history pages already have cursors, so pages must chain; but balances pages and parsed-transaction batches can go concurrent with bounded concurrency ~4): expected 40–60% cold-time cut on fetch-dominated wallets; complexity LOW; risk LOW (same data, same order after sorting).
2. **Persist the 10-minute profile cache to disk/KV** so warm starts survive restarts and are shared across instances: expected warm-path 0ms everywhere; complexity LOW-MEDIUM; risk NONE to correctness (TTL unchanged).
3. **Raise Helius rate-limit headroom**: batch parsed-transaction lookups already exist; reduce balances calls by requesting only once per analysis (currently re-fetched per retry loop) — REDUNDANT_REQUEST; complexity LOW; risk LOW.
4. **Cache SOL bucket misses longer / prefetch common buckets**: modest; complexity MEDIUM; risk LOW (TTL only).
5. Do NOT touch the 1000-tx window, pricing evidence, persona requirements, or output results.

---

## FINAL REPORT

- **TOTAL COLD TIME (avg across the four wallets): 35062 ms** (range 25685–46048 ms)
- **TOTAL WARM TIME: 0 ms** (profile cache hit — all wallets 0 ms)
- **TOP 3 BOTTLENECKS**: 1) serialized Helius pagination incl. parsed-transaction batches; 2) balances-endpoint request volume + 429 retry backoff; 3) serialized SOL/token historical price ranges (wallet-dependent).
- **EXTERNAL REQUEST COUNT**: 175 across four cold analyses (avg 44/wallet).
- **CACHE HIT RATE**: warm profile cache 100% (0 ms); token-price cache hits 0 (cold runs start empty by design).
- **FASTEST SAFE OPTIMIZATION**: bounded-concurrency Helius pagination (#1) + persisted warm cache (#2).
- **ESTIMATED TIME AFTER OPTIMIZATION**: cold ≈ 15778–21037 ms (fetch-bound wallets shrink proportionally to fetch share); warm stays 0 ms.
