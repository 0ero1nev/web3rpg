# Phase 8C — Helius request graph, 429 attribution, and low-activity balance elision

Generated: 2026-10-07 (Asia/Shanghai)

## 1. Request graph reconstructed from the Phase 8B trace

The Phase 8B Diogenes trace contained 40 successful provider requests and 18
429 retries (58 attempts total):

```text
fetchHeliusWalletData
├─ balances pagination (serial): 20 success + 13 retry attempts
└─ history pagination (serial): 10 success + 1 retry attempt
   └─ parsed-transaction enrichment (10 batches, concurrency 3):
      10 success + 4 retry attempts
```

The trace recorder appends requests when they complete, so it does not expose
exact start timestamps. The dependency graph above comes from the fetch code;
completion order and per-attempt durations from the trace confirm the two page
chains interleaved and parsed enrichment began after history completed.

| Family | Successful | 429 | All attempts | Recorded fetch time |
|---|---:|---:|---:|---:|
| balances | 20 | 13 | 33 | 8.015 s |
| history page | 10 | 1 | 11 | 14.490 s |
| parsed transactions | 10 | 4 | 14 | 24.122 s |
| **Total** | **40** | **18** | **58** | **46.627 s** |

Fetch durations overlap; they must not be added to derive the 38.009 s wall
time. Retry sleeps occur outside the fetch wrapper. Reconstructing the retry
sequence attributes roughly 21 s of the critical path to 429 backoff.

## 2. Balance page-size probe

The same wallet was probed with requested limits 1,000, 500, and 200. Every
response was HTTP 200 but returned only 100 balances with `hasMore=true`.
Helius therefore enforces a 100-item server-side cap for this endpoint; the
20-page chain cannot be reduced to 2–4 pages by increasing `limit`.

## 3. Scheduler experiments

Concurrency caps and request-start pacing were tested in fresh processes. They
did not improve the quota-bound workload:

| Variant | Total | Attempts | 429 |
|---|---:|---:|---:|
| no global scheduler | 41.646 s | 56 | 16 |
| global concurrency 1 | 58.682 s | 40 | 0 |
| global concurrency 2 | 45.194 s | 56 | 16 |
| concurrency 2 + parsed 2 | 51.855 s | 54 | 14 |
| 200 ms start interval | 45.033 s | 55 | 15 |
| 150 ms start interval | 53.018 s | 54 | 14 |
| 120 ms start interval | 44.686 s | 53 | 13 |

Serializing removed 429s but cost 17 seconds. Smaller caps and pacing retained
most 429s while adding wall time. The experimental scheduler was therefore
removed rather than shipped disabled.

## 4. Implemented optimization

Balances are outcome-irrelevant when the fully classified analysis window has
fewer than 10 qualifying swaps: every normal Persona is ineligible and the
special Diogenes result only needs the swap count.

The fetch layer now:

1. fetches the complete configured history window;
2. uses the production normalization and position-reconstruction rules to
   count qualifying swaps (including provider labels, netting, and quote-asset
   exclusion);
3. runs parsed enrichment to resolve unclassified transactions;
4. skips balances only if the final exact count remains below 10.

For wallets already unambiguously at or above 10 in raw history, balances and
parsed enrichment still run concurrently. This avoids unnecessarily
serializing the ordinary active-wallet path. A wallet promoted across the
threshold by parsed enrichment fetches balances afterward.

## 5. 429 attribution and after measurement

### Phase 8B baseline

- balances: 13/18 429s (72.2%)
- parsed transactions: 4/18 (22.2%)
- history: 1/18 (5.6%)

The balance chain was the dominant source of quota pressure. Its requests also
overlapped the history chain, causing retries outside its own family.

### Phase 8C Diogenes run

| Metric | Phase 8B | Phase 8C | Change |
|---|---:|---:|---:|
| Cold wall time | 38.009 s | 29.088 s | **-23.5%** |
| Request attempts | 58 | 20 | **-65.5%** |
| Successful balance pages | 20 | 0 | **-100%** |
| 429 retries | 18 | 0 | **-100%** |
| Result kind | SPECIAL_PERSONA | SPECIAL_PERSONA | unchanged |
| Warm path | 0 ms | 0 ms | unchanged |

The live qualifying-swap count moved from 2 to 0 as the 1,000-transaction
window advanced; both values remain below the same 10-swap routing boundary.
The result kind is unchanged, and no normal Persona became eligible.

## 6. Verification

- TypeScript: clean
- ESLint on changed files: clean
- Analysis, Persona, and Solana tests: 53/53 pass
- Added boundary coverage:
  - nine qualifying swaps skip balances;
  - the tenth qualifying swap preserves the balance fetch;
  - labeled transfers with two-sided changes do not count as swaps;
  - quote-to-quote swaps do not count as qualifying swaps.

Raw after profile: `diogenes-phase8c.json` in this directory.
