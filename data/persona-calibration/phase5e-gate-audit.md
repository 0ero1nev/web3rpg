# Phase 5E — Persona Eligibility Gate Audit

Generated: 2026-10-06T07:04:32.341Z (Asia/Shanghai)

Offline audit of Phase 5C outputs. No production changes, no new personas, MIN_WINNING_MATCH stays 50.
Gate rules mirrored from personaScoring.ts; EFFICIENCY proxied by realizedPnlUsd !== null;
priced re-entry pairs bounded by reentryCount (not stored directly).

Categories: A = genuinely missing behavior, B = missing price/valuation coverage,
C = arbitrary near-miss, D = logically necessary evidence (gate justified).

Scope check: 14 cases (7 Newton, 7 Sisyphus).

## Newton cases

Code fact first: **execution-price re-entry comparison is already the implemented mechanism.**
`reconstructPositions.ts` sets `reentryPriceUsd = leg.unitPriceUsd` (the re-entry trade's own
execution valuation) and `exitPriceUsd = ledger.lastExitPriceUsd`; `reenteredHigher` compares those
two executions directly. External historical price is never required for this evidence.

### T9 [T] Newton match=81 conf=9
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 10 | 271 | 10 | pass | D |
| completedPositionCount > 0 | 0 | >= 1 | no completed position | A |
| reentryCount >= 2 | 0 | 2 | -2 | A |
| pricedReentries >= 2 (both legs execution-valued) | <= 0 (bounded by reentryCount) | 2 | at most 0 | A |

### P4 [P] Newton match=69 conf=9
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 10 | 118 | 10 | pass | D |
| completedPositionCount > 0 | 0 | >= 1 | no completed position | A |
| reentryCount >= 2 | 0 | 2 | -2 | A |
| pricedReentries >= 2 (both legs execution-valued) | <= 0 (bounded by reentryCount) | 2 | at most 0 | A |

### P5 [P] Newton match=57 conf=8
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 10 | 51 | 10 | pass | D |
| completedPositionCount > 0 | 0 | >= 1 | no completed position | A |
| reentryCount >= 2 | 0 | 2 | -2 | A |
| pricedReentries >= 2 (both legs execution-valued) | <= 0 (bounded by reentryCount) | 2 | at most 0 | A |

### L1 [L] Newton match=60 conf=67
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 10 | 14 | 10 | pass | D |
| completedPositionCount > 0 | 3 | >= 1 | pass | D |
| reentryCount >= 2 | 1 | 2 | -1 | A |
| pricedReentries >= 2 (both legs execution-valued) | <= 1 (bounded by reentryCount) | 2 | at most 1 | A |

### M4 [M] Newton match=59 conf=8
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 10 | 56 | 10 | pass | D |
| completedPositionCount > 0 | 0 | >= 1 | no completed position | A |
| reentryCount >= 2 | 0 | 2 | -2 | A |
| pricedReentries >= 2 (both legs execution-valued) | <= 0 (bounded by reentryCount) | 2 | at most 0 | A |

### M5 [M] Newton match=60 conf=8
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 10 | 60 | 10 | pass | D |
| completedPositionCount > 0 | 0 | >= 1 | no completed position | A |
| reentryCount >= 2 | 0 | 2 | -2 | A |
| pricedReentries >= 2 (both legs execution-valued) | <= 0 (bounded by reentryCount) | 2 | at most 0 | A |

### M6 [M] Newton match=61 conf=8
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 10 | 67 | 10 | pass | D |
| completedPositionCount > 0 | 0 | >= 1 | no completed position | A |
| reentryCount >= 2 | 0 | 2 | -2 | A |
| pricedReentries >= 2 (both legs execution-valued) | <= 0 (bounded by reentryCount) | 2 | at most 0 | A |

**Newton audit verdict:** of the 7 blocked wallets, 6 fail `completedPositionCount > 0` outright — they never fully exit any position, so exit->re-entry
pairs do not exist at any price. The remaining wallet (L1) has 3 exits but only 1 re-entry
(needs 2). Therefore **0 of 7** blocked Newton wallets could obtain valid higher-price
re-entry evidence from execution valuation: the binding constraint is behavioral structure,
not pricing. The evidence gate itself is logically necessary (category D) for a FOMO-re-entry persona.

## Sisyphus cases

### T7 [T] Sisyphus match=78 conf=64
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 25 | 346 | 25 | pass | D |
| EFFICIENCY.value !== null (priced economic progress) | computable (realizedPnlUsd = 0.88) | non-null | pass | D |
| realizedPnlUsd.coverage >= 0.5 | 0.05 | 0.5 | -0.45 | B |

### P7 [P] Sisyphus match=52 conf=67
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 25 | 52 | 25 | pass | D |
| EFFICIENCY.value !== null (priced economic progress) | computable (realizedPnlUsd = 1.11) | non-null | pass | D |
| realizedPnlUsd.coverage >= 0.5 | 0.10 | 0.5 | -0.40 | B |

### P8 [P] Sisyphus match=86 conf=71
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 25 | 151 | 25 | pass | D |
| EFFICIENCY.value !== null (priced economic progress) | computable (realizedPnlUsd = 0.88) | non-null | pass | D |
| realizedPnlUsd.coverage >= 0.5 | 0.04 | 0.5 | -0.46 | B |

### P9 [P] Sisyphus match=54 conf=56
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 25 | 39 | 25 | pass | D |
| EFFICIENCY.value !== null (priced economic progress) | computable (realizedPnlUsd = 0.72) | non-null | pass | D |
| realizedPnlUsd.coverage >= 0.5 | 0.08 | 0.5 | -0.42 | B |

### L7 [L] Sisyphus match=57 conf=48
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 25 | 24 | 25 | -1 | C |
| EFFICIENCY.value !== null (priced economic progress) | computable (realizedPnlUsd = -40.84) | non-null | pass | D |
| realizedPnlUsd.coverage >= 0.5 | 0.09 | 0.5 | -0.41 | B |

### L10 [L] Sisyphus match=61 conf=70
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 25 | 84 | 25 | pass | D |
| EFFICIENCY.value !== null (priced economic progress) | computable (realizedPnlUsd = -18.04) | non-null | pass | D |
| realizedPnlUsd.coverage >= 0.5 | 0.30 | 0.5 | -0.20 | B |

### M8 [M] Sisyphus match=59 conf=63
| Gate | Observed | Required | Distance | Category |
|---|---|---|---|---|
| qualifyingSwaps >= 25 | 74 | 25 | pass | D |
| EFFICIENCY.value !== null (priced economic progress) | computable (realizedPnlUsd = 0.00) | non-null | pass | D |
| realizedPnlUsd.coverage >= 0.5 | 0.08 | 0.5 | -0.42 | B |

**Sisyphus audit verdict:** all 7 fail `realizedPnlUsd.coverage >= 0.5` (distances -0.20 to -0.46);
L7 additionally misses `qualifyingSwaps >= 25` by exactly 1 swap (category C near-miss). In ALL 7 the
stagnation signal EXISTS — realized PnL is measurable and matches run 52-86 — so every coverage
failure is **category B (missing valuation coverage)**: "strong stagnation signal, confidence
incomplete". P9's signal is the thinnest: its $0.72 realized PnL comes from partial sells with zero
completed episodes, so coverage cannot grow without more valued disposals — but the direction is
still measurable, not absent.

## Counterfactual coverage simulations

### A: Newton execution-price re-entry evidence (drop pricing gate only)
- Assigned: **22/40 (55.0%)**
- Assignment changes: none
- Winner distribution: caesar×9, sisyphus×6, newton×4, icarus×1, napoleon×1, don_quixote×1

### B: Sisyphus binary PnL-coverage gate -> confidence degradation
- Assigned: **29/40 (72.5%)**
- Assignment changes:
  - T1: caesar -> sisyphus
  - T2: caesar -> sisyphus
  - T5: newton -> sisyphus
  - T7: — -> sisyphus
  - T8: newton -> sisyphus
  - P5: — -> sisyphus
  - P7: — -> sisyphus
  - P8: — -> sisyphus
  - P9: — -> sisyphus
  - L8: caesar -> sisyphus
  - L10: — -> sisyphus
  - M1: caesar -> sisyphus
  - M3: caesar -> sisyphus
  - M8: — -> sisyphus
- Winner distribution: sisyphus×20, newton×2, caesar×4, icarus×1, napoleon×1, don_quixote×1

### C: A + B
- Assigned: **29/40 (72.5%)**
- Assignment changes:
  - T1: caesar -> sisyphus
  - T2: caesar -> sisyphus
  - T5: newton -> sisyphus
  - T7: — -> sisyphus
  - T8: newton -> sisyphus
  - P5: — -> sisyphus
  - P7: — -> sisyphus
  - P8: — -> sisyphus
  - P9: — -> sisyphus
  - L8: caesar -> sisyphus
  - L10: — -> sisyphus
  - M1: caesar -> sisyphus
  - M3: caesar -> sisyphus
  - M8: — -> sisyphus
- Winner distribution: sisyphus×20, newton×2, caesar×4, icarus×1, napoleon×1, don_quixote×1

## Conclusion — is 55% a PERSONA GAP or an EVIDENCE/ELIGIBILITY GAP?

Sim A (Newton execution-price evidence) unlocks **0 wallets** — the Newton half of the
gap is behavioral structure, not pricing. Sim B (de-binary the Sisyphus PnL-coverage gate) moves
coverage from 22/40 to **29/40 (72.5%)**.
Sim C equals Sim B (29/40) because A adds nothing.

Verdict: the NO_STRONG_MATCH gap above 50 match is **primarily an evidence/eligibility gap**, not a
persona gap. The largest recoverable slice is Sisyphus's binary PnL-coverage gate, which blocks real
stagnation signals (category B) on wallets that never get enough valued exits; a smaller slice is
genuinely absent behavior (never-exit wallets, category A), and one single-swap near-miss (category C).
**Redistribution side effect (important):** sim B does not only add coverage — it also flips 7
already-assigned wallets to Sisyphus (winner distribution: sisyphus 6->20, caesar 9->4). Without
a compensating confidence penalty in a real implementation, de-binarying this gate would
concentrate winners heavily; coverage and distribution must be evaluated together.
No thresholds were tuned to reach any target; these are mechanical consequences of the stated swaps.

Analysis only. Nothing in this run modifies production scoring, personas, or MIN_WINNING_MATCH.
