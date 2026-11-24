# Phase 5D — NO_STRONG_MATCH Gap Analysis

Generated: 2026-10-06T06:30:43.808Z (Asia/Shanghai)

Offline analysis of Phase 5C outputs only. No API calls, no rescoring, no production
changes, no new personas, no threshold tuning. MIN_WINNING_MATCH stays 50.

Scope: the 18 selected wallets with `resultReason = "NO_STRONG_MATCH"` (of 40 selected; 22 assigned).

## 1. Per-wallet table

| Wallet | Stratum | qSwaps | Realized PnL | PnL cov | Volume | Completed | Open | Re-entries (rate) | Top persona | Highest match | Eligible-but-under-50 |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---:|---|
| T7 | T | 346 | $1 | 0.05 | $658 | 4 | 4 | 1 (0.25) | sisyphus@78 | 78 | caesar@44 |
| T9 | T | 271 | — | 0.00 | $1 | 0 | 258 | 0 (—) | newton@81 | 81 | — |
| P1 | P | 210 | $1871 | 0.79 | $31969 | 37 | 45 | 3 (0.08) | sisyphus@44 | 44 | sisyphus@44 |
| P3 | P | 41 | $89 | 0.12 | $1524 | 3 | 12 | 0 (0.00) | sisyphus@34 | 34 | — |
| P4 | P | 118 | $88 | 0.01 | $3001 | 0 | 2 | 0 (—) | newton@69 | 69 | — |
| P5 | P | 51 | $32 | 0.14 | $3336 | 0 | 9 | 0 (—) | newton@57 | 57 | caesar@44 |
| P7 | P | 52 | $1 | 0.10 | $1488 | 1 | 19 | 0 (0.00) | sisyphus@52 | 52 | — |
| P8 | P | 151 | $1 | 0.04 | $2987 | 2 | 3 | 0 (0.00) | sisyphus@86 | 86 | — |
| P9 | P | 39 | $1 | 0.08 | $4864 | 0 | 12 | 0 (—) | sisyphus@54 | 54 | caesar@42 |
| L1 | L | 14 | $-890 | 0.57 | $10435 | 3 | 3 | 1 (0.33) | newton@60 | 60 | — |
| L7 | L | 24 | $-41 | 0.09 | $10722 | 1 | 0 | 0 (0.00) | sisyphus@57 | 57 | caesar@49 |
| L9 | L | 19 | $-22 | 0.22 | $712 | 2 | 5 | 1 (0.50) | icarus@46 | 46 | — |
| L10 | L | 84 | $-18 | 0.30 | $6326 | 1 | 14 | 0 (0.00) | sisyphus@61 | 61 | caesar@41 |
| M4 | M | 56 | — | 0.00 | $37 | 0 | 0 | 0 (—) | newton@59 | 59 | — |
| M5 | M | 60 | — | 0.00 | $1458 | 0 | 1 | 0 (—) | newton@60 | 60 | — |
| M6 | M | 67 | — | 0.00 | $3664 | 0 | 0 | 0 (—) | newton@61 | 61 | — |
| M7 | M | 74 | — | 0.00 | $16840 | 7 | 9 | 0 (0.00) | caesar@47 | 47 | — |
| M8 | M | 74 | $0 | 0.08 | $65 | 1 | 20 | 0 (0.00) | sisyphus@59 | 59 | caesar@40 |

Turnover and concentration scores were not captured in Phase 5C outputs; qualifyingSwaps
and tradedTokenCount serve as labeled proxies. Full persona cells (match/eligible/confidence)
for every wallet are in phase5d-gap-analysis.json.

## 2. Profitable-exit discipline evidence

A wallet is counted in cluster A only if ALL hold: measurable realized profit (coverage ≥ 0.2),
≥ 3 completed exits, re-entry rate ≤ 0.25, every priced episode giveback < 0.6, and no severe
(≤ −50%, ≥ 30d) still-held loser. Priced-episode evidence is mandatory — without prices the
“retained the gains” step cannot be verified and the wallet is NOT claimed for A.

**0 of 18** wallets show observable profitable-exit discipline.

Measurability split: 6 wallets have ≥ 1 priced episode (verifiable);
12 wallets have ZERO priced episodes — profitable-exit discipline is UNMEASURABLE
for them, not refuted. The flagship case is P1: realized PnL +$1,871 at 0.79 coverage with
37 completed exits and an 0.08 re-entry rate, yet 0 of its 40 eligible episodes received
historical peak pricing (long-tail mints unsupported / 20-request budget). Among the
verifiable wallets, every one with priced episodes shows giveback ≥ 0.99 or losses — the
cluster exists as a hypothesis but current price coverage cannot confirm it.

Per-wallet A-check detail (failed checks only):
- T7: measurableProfit, retainedPricedGains
- T9: measurableProfit, multipleExits, lowReentry
- P1: retainedPricedGains
- P3: measurableProfit, retainedPricedGains
- P4: measurableProfit, multipleExits, lowReentry, retainedPricedGains
- P5: measurableProfit, multipleExits, lowReentry, retainedPricedGains
- P7: measurableProfit, multipleExits, retainedPricedGains
- P8: measurableProfit, multipleExits, retainedPricedGains
- P9: measurableProfit, multipleExits, lowReentry, retainedPricedGains
- L1: measurableProfit, lowReentry, retainedPricedGains
- L7: measurableProfit, multipleExits, retainedPricedGains
- L9: measurableProfit, multipleExits, lowReentry, retainedPricedGains
- L10: measurableProfit, multipleExits, retainedPricedGains
- M4: measurableProfit, multipleExits, lowReentry, retainedPricedGains
- M5: measurableProfit, multipleExits, lowReentry, retainedPricedGains
- M6: measurableProfit, multipleExits, lowReentry, retainedPricedGains
- M7: measurableProfit, retainedPricedGains
- M8: measurableProfit, multipleExits, retainedPricedGains

## 3. Low-drama / disciplined cluster

Cluster B (evaluated on wallets not in A): minimal re-entry, moderate activity (≤ 200 swaps),
≥ 4 tokens, no priced giveback ≥ 0.5, no severe long-held loser, Napoleon-ineligible.

Result: **1 wallets** qualify with priced evidence, plus 11 with the same behavior shape but no priced episodes (labeled B?, economic quality unverifiable).
Members: P3(B?), P4(B?), P5(B?), P7(B?), P9(B?), L1(B?), L7(B), M4(B?), M5(B?), M6(B?), M7(B?), M8(B?).

## 4. Clusters

| Cluster | Wallets | Members |
|---|---:|---|
| C — weak/mixed (near-miss 40–49) | 3 | T7, P1, L10 |
| E — other recurring patterns | 3 | T9, P8, L9 |
| B? — low-drama shape, unpriced | 11 | P3, P4, P5, P7, P9, L1, M4, M5, M6, M7, M8 |
| B — low-drama diversified (priced) | 1 | L7 |

A cluster is treated as meaningful only at ≥ 3 wallets: A=0 (NOT yet meaningful), B=12 (meaningful).

Unexplained remainder (C/D/E): 6 wallets.

## 5. Coverage simulation

| Scenario | Coverage |
|---|---:|
| Current personas | 22/40 (55.0%) |
| + cluster A as a valid persona (upper-bound estimate) | 22/40 (55.0%) |
| + clusters A and B (upper bound, includes unpriced B?) | 34/40 (85.0%) |
| strict variant — only priced-evidence clusters (A=0, B=1) | 23/40 (57.5%) |

Remaining unexplained after A+B: 6 of 40.
These are plausibility upper bounds: a real persona would still need to score ≥ 50 on each
wallet under an actual formula; cluster membership here only asserts the observable evidence.

Near-miss wallets (an eligible persona at match 40–49) are a separate lever: 7 of 18 NSM wallets are threshold-adjacent rather than behaviorally novel.

## 6. Data gaps encountered (for future capture, not implemented)

- turnoverScore / concentrationScore not captured in Phase 5C outputs — activity and token-count proxies used instead
- per-episode realized returns and priced re-entry direction not captured — profitable-exit discipline verified only through wallet-level realized PnL, re-entry counts, and top priced Icarus episodes
- most wallets have 0-2 priced episodes, so 'retained gains' checks rest on thin evidence

Analysis only. No scoring formula, threshold, or eligibility rule was modified.
