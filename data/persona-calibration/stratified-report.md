# Phase 5C — Behavior-Stratified Trader Calibration (40 wallets)

Generated: 2026-10-06T06:12:55.851Z (Asia/Shanghai)

Sampling: candidates discovered on-chain as feePayers of recently-active mints (no
leaderboard API keys available; leaderboard data was only ever going to be a discovery
aid anyway). Strata are decided EXCLUSIVELY by this repo's own engine, and every
included wallet passes qualifyingSwaps >= 10. Pipeline and scoring: Phase 5B state, unchanged.

Screened pool: 149 fully analyzed (1 failures); 65 passed qualifyingSwaps >= 10.

## Strata fill

| Stratum | Target | Filled |
|---|---:|---:|
| T — highest trade count | 10 | 10 |
| P — highest realized PnL | 10 | 10 |
| L — lowest realized PnL | 10 | 10 |
| M — mid activity | 10 | 10 |
| F — fallback fill | — | 0 |

## Per-stratum results

### T (n=10, qualifyingSwaps 226–574, PnL $-177…$298)

- Assigned: 8/10; NO_STRONG_MATCH: 2; INSUFFICIENT_HISTORY: 0
- Don Quixote: non-zero 3, eligible 4, wins 0
- Winners: sisyphus×2, newton×3, caesar×3

### P (n=10, qualifyingSwaps 19–210, PnL $0…$1871)

- Assigned: 3/10; NO_STRONG_MATCH: 7; INSUFFICIENT_HISTORY: 0
- Don Quixote: non-zero 5, eligible 5, wins 0
- Winners: sisyphus×1, newton×1, caesar×1

### L (n=10, qualifyingSwaps 14–176, PnL $-890…$-18)

- Assigned: 6/10; NO_STRONG_MATCH: 4; INSUFFICIENT_HISTORY: 0
- Don Quixote: non-zero 3, eligible 4, wins 1
- Winners: sisyphus×1, caesar×2, icarus×1, don_quixote×1, napoleon×1

### M (n=10, qualifyingSwaps 33–80, PnL $-2…$0)

- Assigned: 5/10; NO_STRONG_MATCH: 5; INSUFFICIENT_HISTORY: 0
- Don Quixote: non-zero 1, eligible 1, wins 0
- Winners: sisyphus×2, caesar×3

## Overall vs the Phase 5/5B 44-wallet set

| Metric | 44-wallet set | This 40-wallet trader set |
|---|---:|---:|
| Assigned winner | 11/44 | 22/40 |
| Don Quixote non-zero | 3/44 | 12/40 |
| Icarus measurable / wins | — | 13/40 measurable, 1 wins |

Winner distribution: sisyphus×6, newton×4, caesar×9, icarus×1, don_quixote×1, napoleon×1.

Raw per-wallet results: stratified-results.jsonl; dataset: stratified-dataset.json;
aggregates: stratified-summary.json.
