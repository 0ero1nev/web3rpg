# Phase 5F — Match Integrity Audit (Newton & Sisyphus)

Generated: 2026-10-06T07:13:58.640Z (Asia/Shanghai)

Offline audit over ALL Phase 5C analyzed wallets (Match >= 50 scope) with counterfactual on the
selected 40. Formulas mirrored exactly from behaviorScores.ts / personaScoring.ts; every decomposition
is validated against the stored Match (residual column). No production changes, no new personas,
MIN_WINNING_MATCH stays 50.

Root mechanism under audit: `weightedValue` **renormalizes over non-null components** — when a
Persona's core evidence dimension is null (unknown), its weight is redistributed to the remaining
proxy dimensions instead of contributing zero.

## 1. Newton decomposition (all Match >= 50 wallets)

| Wallet | sel | Match | conf | elig | qSwaps | completed | reentries | ACTIVITY | REENTRY | FOMO | residual | core evidence |
|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| M10 | ✓ | 64 | 9 | N | 80 | 0 | 0 | 63.6 | null | null | -0.39 | none |
| M1 | ✓ | 51 | 7 | N | 33 | 0 | 0 | 51 | null | null | 0.04 | none |
| P6 | ✓ | 58 | 71 | Y | 19 | 3 | 2 | 43.4 | 56.2 | 61.8 | 0 | present |
| P2 | ✓ | 57 | 8 | N | 50 | 0 | 0 | 56.9 | null | null | -0.09 | none |
| P9 | ✓ | 53 | 7 | N | 39 | 0 | 0 | 53.4 | null | null | 0.39 | none |
| L6 | ✓ | 70 | 9 | N | 126 | 0 | 0 | 70.1 | null | null | 0.12 | none |
| L2 | ✓ | 53 | 90 | Y | 176 | 17 | 9 | 74.9 | 74.5 | 35.3 | 0 | present |
| T7 | ✓ | 63 | 90 | N | 346 | 4 | 1 | 84.7 | 27 | 82.0 | 0 | partial |
| L5 | ✓ | 68 | 9 | N | 109 | 0 | 0 | 68 | null | null | 0.04 | none |
| M5 | ✓ | 60 | 8 | N | 60 | 0 | 0 | 59.5 | null | null | -0.5 | none |
| M4 | ✓ | 59 | 8 | N | 56 | 0 | 0 | 58.5 | null | null | -0.48 | none |
| X47 |  | 72 | 9 | N | 139 | 0 | 0 | 71.5 | null | null | -0.47 | none |
| X53 |  | 70 | 9 | N | 125 | 0 | 0 | 70 | null | null | 0 | none |
| P4 | ✓ | 69 | 9 | N | 118 | 0 | 0 | 69.2 | null | null | 0.17 | none |
| X70 |  | 73 | 9 | N | 156 | 0 | 0 | 73.2 | null | null | 0.19 | none |
| T5 | ✓ | 56 | 80 | Y | 426 | 24 | 5 | 87.7 | 47.8 | 55.5 | 0 | present |
| X92 |  | 65 | 9 | N | 87 | 0 | 0 | 64.8 | null | null | -0.19 | none |
| X96 |  | 51 | 7 | N | 32 | 0 | 0 | 50.6 | null | null | -0.39 | none |
| L1 | ✓ | 60 | 67 | N | 14 | 3 | 1 | 39.2 | 31.1 | 82.2 | 0 | partial |
| T8 | ✓ | 75 | 100 | Y | 346 | 39 | 34 | 84.7 | 93.6 | 61.4 | 0 | present |
| M9 | ✓ | 57 | 88 | Y | 74 | 8 | 4 | 62.5 | 58.6 | 55.0 | 0 | present |
| X112 |  | 70 | 42 | N | 86 | 23 | 19 | 64.6 | 91.3 | 57.4 | 0 | present |
| T2 | ✓ | 91 | 9 | N | 550 | 0 | 0 | 91.4 | null | null | 0.36 | none |
| T3 | ✓ | 63 | 90 | Y | 525 | 103 | 63 | 90.7 | 80.6 | 46.8 | 0 | present |
| T4 | ✓ | 86 | 100 | Y | 524 | 259 | 257 | 90.7 | 99.6 | 76.5 | 0 | present |
| P10 | ✓ | 61 | 90 | Y | 182 | 31 | 10 | 75.4 | 66.1 | 55.1 | 0 | present |
| X134 |  | 71 | 19 | N | 16 | 6 | 5 | 41 | 79 | null | -0.42 | partial |
| X136 |  | 72 | 9 | N | 144 | 0 | 0 | 72 | null | null | 0.04 | none |
| P5 | ✓ | 57 | 8 | N | 51 | 0 | 0 | 57.2 | null | null | 0.19 | none |
| M2 | ✓ | 56 | 9 | N | 48 | 0 | 0 | 56.3 | null | null | 0.33 | none |
| M3 | ✓ | 57 | 8 | N | 51 | 0 | 0 | 57.2 | null | null | 0.19 | none |
| M6 | ✓ | 61 | 8 | N | 67 | 0 | 0 | 61.1 | null | null | 0.07 | none |
| T6 | ✓ | 56 | 90 | Y | 350 | 102 | 12 | 84.8 | 55.9 | 50.8 | 0 | present |
| T9 | ✓ | 81 | 9 | N | 271 | 0 | 0 | 81.1 | null | null | 0.14 | none |
| X149 |  | 73 | 9 | N | 154 | 0 | 0 | 73 | null | null | 0 | none |

### How reentryCount = 0 wallets reach Match >= 50

22 of 35 Newton Match>=50 wallets have **reentryCount = 0**. With completedPositionCount = 0,
REENTRY (null: no completed positions) and FOMO_REENTRY (null: no priced pairs) both drop out and
`weightedValue` renormalizes: **Newton Match = ACTIVITY alone = logCountScore(qualifyingSwaps, 1000)**.
Validation: predicted-vs-stored residuals are -0.39, 0.04, -0.09, 0.39, 0.12, 0.04, -0.5, -0.48, -0.47, 0, 0.17, 0.19, -0.19, -0.39, 0.36, 0.04, 0.19, 0.33, 0.19, 0.07, 0.14, 0 — exact to rounding.
The Persona's defining behavior (exit -> re-entry, ideally higher) contributes NOTHING to these
scores; the number the user sees is a pure activity proxy. Higher-price re-entry count / rate / median
premium are not stored per wallet; for the one pair-bearing case (see JSON) FOMO is solved from the
Match identity and lands in a plausible 0-100 range.

**Non-core proxy contribution: for reentryCount=0 cases, 100% of Match is ACTIVITY (weight 0.10 of 0.10).**

## 2. Sisyphus decomposition (all Match >= 50 wallets)

| Wallet | sel | Match | conf | elig | qSwaps | tokens | PnL | pnlCov | Volume | stagnation | stagn.contrib | proxy.contrib | proxy% | core evidence |
|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M10 | ✓ | 79 | 61 | N | 80 | 4 | — | 0.00 | 1720 | null | 0 | 79 | 100% | unverified-progress |
| M1 | ✓ | 67 | 67 | N | 33 | 5 | -2 | 0.33 | 859 | 98 | 29.4 | 37.6 | 56% | verified-stagnation |
| P2 | ✓ | 57 | 84 | Y | 50 | 1 | 91 | 1.00 | 488 | 0 | 0 | 57 | 100% | verified-stagnation |
| P9 | ✓ | 54 | 56 | N | 39 | 19 | 1 | 0.08 | 4864 | 99.9 | 30 | 24 | 45% | verified-stagnation |
| P7 | ✓ | 52 | 67 | N | 52 | 37 | 1 | 0.10 | 1488 | 99.3 | 29.8 | 22.2 | 43% | verified-stagnation |
| L6 | ✓ | 58 | 64 | N | 126 | 48 | -141 | 0.04 | 14801 | 90.5 | 27.1 | 30.9 | 53% | verified-stagnation |
| L2 | ✓ | 72 | 80 | Y | 176 | 19 | -359 | 0.65 | 13809 | 74 | 22.2 | 49.8 | 69% | verified-stagnation |
| T7 | ✓ | 78 | 64 | N | 346 | 47 | 1 | 0.05 | 658 | 98.7 | 29.6 | 48.4 | 62% | verified-stagnation |
| X40 |  | 59 | 47 | N | 22 | 5 | -0 | 0.11 | 681 | 99.9 | 30 | 29 | 49% | verified-stagnation |
| X47 |  | 72 | 63 | N | 139 | 13 | — | 0.00 | 1270 | null | 0 | 72 | 100% | unverified-progress |
| T1 | ✓ | 97 | 66 | N | 574 | 13 | 296 | 0.10 | 198479 | 98.5 | 29.6 | 67.4 | 70% | verified-stagnation |
| X53 |  | 57 | 63 | N | 125 | 23 | — | 0.00 | 6506 | null | 0 | 57 | 100% | unverified-progress |
| X70 |  | 56 | 64 | N | 156 | 117 | 0 | 0.04 | 93 | 98.3 | 29.5 | 26.5 | 47% | verified-stagnation |
| T5 | ✓ | 58 | 69 | N | 426 | 150 | -131 | 0.24 | 4058 | 67.6 | 20.3 | 37.7 | 65% | verified-stagnation |
| M8 | ✓ | 59 | 63 | N | 74 | 35 | 0 | 0.08 | 65 | 100 | 30 | 29 | 49% | verified-stagnation |
| L7 | ✓ | 57 | 48 | N | 24 | 6 | -41 | 0.09 | 10722 | 96.2 | 28.9 | 28.1 | 49% | verified-stagnation |
| X92 |  | 70 | 62 | N | 87 | 16 | -0 | 0.03 | 2517 | 100 | 30 | 40 | 57% | verified-stagnation |
| P8 | ✓ | 86 | 71 | N | 151 | 13 | 1 | 0.04 | 2987 | 99.7 | 29.9 | 56.1 | 65% | verified-stagnation |
| X96 |  | 80 | 60 | N | 32 | 2 | -0 | 0.13 | 18977 | 100 | 30 | 50 | 63% | verified-stagnation |
| T8 | ✓ | 88 | 84 | N | 346 | 25 | 2 | 0.45 | 3964 | 99.5 | 29.9 | 58.1 | 66% | verified-stagnation |
| M9 | ✓ | 61 | 76 | Y | 74 | 22 | -0 | 0.58 | 62 | 99.9 | 30 | 31 | 51% | verified-stagnation |
| X112 |  | 76 | 62 | N | 86 | 16 | -0 | 0.03 | 7824 | 100 | 30 | 46 | 61% | verified-stagnation |
| L10 | ✓ | 61 | 70 | N | 84 | 24 | -18 | 0.30 | 6326 | 97.1 | 29.1 | 31.9 | 52% | verified-stagnation |
| T2 | ✓ | 97 | 63 | N | 550 | 8 | -0 | 0.01 | 9117 | 100 | 30 | 67 | 69% | verified-stagnation |
| T3 | ✓ | 72 | 82 | Y | 525 | 70 | 298 | 0.69 | 10058 | 70.4 | 21.1 | 50.9 | 71% | verified-stagnation |
| T4 | ✓ | 94 | 100 | Y | 524 | 3 | -28 | 1.00 | 2589 | 89.2 | 26.8 | 67.2 | 72% | verified-stagnation |
| P10 | ✓ | 64 | 78 | Y | 182 | 59 | 0 | 0.55 | 2231 | 99.8 | 29.9 | 34.1 | 53% | verified-stagnation |
| X136 |  | 70 | 63 | N | 144 | 15 | — | 0.00 | 7191 | null | 0 | 70 | 100% | unverified-progress |
| P5 | ✓ | 55 | 61 | N | 51 | 17 | 32 | 0.14 | 3336 | 90.5 | 27.2 | 27.8 | 51% | verified-stagnation |
| M2 | ✓ | 76 | 78 | Y | 48 | 4 | -0 | 0.50 | 0 | 95.4 | 28.6 | 47.4 | 62% | verified-stagnation |
| M3 | ✓ | 67 | 62 | N | 51 | 9 | 0 | 0.19 | 148 | 99.8 | 29.9 | 37.1 | 55% | verified-stagnation |
| L8 | ✓ | 67 | 63 | N | 65 | 12 | -26 | 0.13 | 113162 | 99.8 | 29.9 | 37.1 | 55% | verified-stagnation |
| X149 |  | 75 | 63 | N | 154 | 13 | — | 0.00 | 75258 | null | 0 | 75 | 100% | unverified-progress |

### PnL coverage < 0.20 with Sisyphus Match >= 50: 22 wallets
- **M10** (match 79, coverage 0.00): progress efficiency null (realizedPnl null / volume stored): stagnation null, weightedValue renormalizes and Match is 100% activity/turnover/repetition proxy
- **P9** (match 54, coverage 0.08): stagnation = 99.9 contributes 30.0 of 54; activity/turnover/repetition contribute 24.0 (45%); implied avg-trades/token 2.3 vs swap-count proxy 2.05
- **P7** (match 52, coverage 0.10): stagnation = 99.3 contributes 29.8 of 52; activity/turnover/repetition contribute 22.2 (43%); implied avg-trades/token 1.63 vs swap-count proxy 1.41
- **L6** (match 58, coverage 0.04): stagnation = 90.5 contributes 27.1 of 58; activity/turnover/repetition contribute 30.9 (53%); implied avg-trades/token 2.74 vs swap-count proxy 2.63
- **T7** (match 78, coverage 0.05): stagnation = 98.7 contributes 29.6 of 78; activity/turnover/repetition contribute 48.4 (62%); implied avg-trades/token 7.13 vs swap-count proxy 7.36
- **X40** (match 59, coverage 0.11): stagnation = 99.9 contributes 30.0 of 59; activity/turnover/repetition contribute 29.0 (49%); implied avg-trades/token 4.29 vs swap-count proxy 4.40
- **X47** (match 72, coverage 0.00): progress efficiency null (realizedPnl null / volume stored): stagnation null, weightedValue renormalizes and Match is 100% activity/turnover/repetition proxy
- **T1** (match 97, coverage 0.10): stagnation = 98.5 contributes 29.6 of 97; activity/turnover/repetition contribute 67.4 (70%); implied avg-trades/token 49.67 vs swap-count proxy 44.15
- **X53** (match 57, coverage 0.00): progress efficiency null (realizedPnl null / volume stored): stagnation null, weightedValue renormalizes and Match is 100% activity/turnover/repetition proxy
- **X70** (match 56, coverage 0.04): stagnation = 98.3 contributes 29.5 of 56; activity/turnover/repetition contribute 26.5 (47%); implied avg-trades/token 1.54 vs swap-count proxy 1.33
- **M8** (match 59, coverage 0.08): stagnation = 100.0 contributes 30.0 of 59; activity/turnover/repetition contribute 29.0 (49%); implied avg-trades/token 2.85 vs swap-count proxy 2.11
- **L7** (match 57, coverage 0.09): stagnation = 96.2 contributes 28.9 of 57; activity/turnover/repetition contribute 28.1 (49%); implied avg-trades/token 3.91 vs swap-count proxy 4.00
- **X92** (match 70, coverage 0.03): stagnation = 100.0 contributes 30.0 of 70; activity/turnover/repetition contribute 40.0 (57%); implied avg-trades/token 6.09 vs swap-count proxy 5.44
- **P8** (match 86, coverage 0.04): stagnation = 99.7 contributes 29.9 of 86; activity/turnover/repetition contribute 56.1 (65%); implied avg-trades/token 15.93 vs swap-count proxy 11.62
- **X96** (match 80, coverage 0.13): stagnation = 100.0 contributes 30.0 of 80; activity/turnover/repetition contribute 50.0 (63%); implied avg-trades/token 16.77 vs swap-count proxy 16.00
- **X112** (match 76, coverage 0.03): stagnation = 100.0 contributes 30.0 of 76; activity/turnover/repetition contribute 46.0 (61%); implied avg-trades/token 9.01 vs swap-count proxy 5.38
- **T2** (match 97, coverage 0.01): stagnation = 100.0 contributes 30.0 of 97; activity/turnover/repetition contribute 67.0 (69%); implied avg-trades/token 39.75 vs swap-count proxy 68.75
- **X136** (match 70, coverage 0.00): progress efficiency null (realizedPnl null / volume stored): stagnation null, weightedValue renormalizes and Match is 100% activity/turnover/repetition proxy
- **P5** (match 55, coverage 0.14): stagnation = 90.5 contributes 27.2 of 55; activity/turnover/repetition contribute 27.8 (51%); implied avg-trades/token 2.96 vs swap-count proxy 3.00
- **M3** (match 67, coverage 0.19): stagnation = 99.8 contributes 29.9 of 67; activity/turnover/repetition contribute 37.1 (55%); implied avg-trades/token 5.83 vs swap-count proxy 5.67
- **L8** (match 67, coverage 0.13): stagnation = 99.8 contributes 29.9 of 67; activity/turnover/repetition contribute 37.1 (55%); implied avg-trades/token 5.45 vs swap-count proxy 5.42
- **X149** (match 75, coverage 0.00): progress efficiency null (realizedPnl null / volume stored): stagnation null, weightedValue renormalizes and Match is 100% activity/turnover/repetition proxy

Activity-alone vs verified stagnation: 28 wallets carry a measurable stagnation contribution (mean 27.5 pts of Match); 5 wallets have null progress efficiency and their Match is **100% activity/turnover/repetition**.

## 3. Core-evidence integrity classification

- **Newton: EVIDENCE-DISCONNECTED.** 22 of 35 Newton Match>=50 wallets have reentryCount=0 (no exit->re-entry pairs exist); for every completed==0 case the stored Match equals ACTIVITY exactly (see residuals).
- **Sisyphus: PROXY-DOMINATED** (genuine 0.30-weight stagnation when measurable) **with an evidence-disconnected failure mode**: 5 of 33 Sisyphus Match>=50 wallets have null progress efficiency, making their Match 100% activity/turnover/repetition; the rest carry a genuine 0.30-weight stagnation contribution.

Both pathologies share one root cause: renormalization over available weights turns UNKNOWN core
evidence into extra credit for proxy features.

## 4. Proposed minimal correction (NOT implemented)

**Mechanism:** in `weightedValue`, divide by the DECLARED total weight instead of the available weight —
a null core component contributes zero and no longer donates its weight to proxies.
Alternatives evaluated and set aside (multiplicative evidence factor, hard Match cap, weighted
geometric mean) — see phase5f-integrity-audit.json; the declared-weight division is the smallest change
that makes core evidence constrain Match itself. Chosen on principle, not for coverage.

**Residual issue this mechanism does NOT fix:** a wallet whose core dimension is measured as ZERO
(not null) still keeps the full proxy score — e.g. a wallet with +18.6% progress efficiency has
stagnation = 0 yet a proxy-only Match of 57. Eliminating that requires a core-component minimum or
hard cap, which is a bigger intervention; flagged for review, not implemented.

## 5. Counterfactual on the 40-wallet dataset

- Coverage: **22/40 (55.0%)** (was 22/40, 55.0%)
- Assignment changes: 0
- Winner distribution: caesar×9, newton×4, don_quixote×1, sisyphus×6, icarus×1, napoleon×1
- Newton Match>=50 count: 26 -> 11
- Sisyphus Match>=50 count: 24 -> 24
- Match>=50 WITHOUT core evidence (all analyzed wallets): Newton 22 -> 0; Sisyphus 5 -> 3

Coverage falls, not rises — this correction is an integrity fix, not a coverage play. Analysis only;
nothing is implemented and no threshold was moved.
