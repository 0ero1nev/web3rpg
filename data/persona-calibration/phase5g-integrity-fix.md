# Phase 5G — Match Integrity Fix

Generated: 2026-10-06T08:04:01.896Z (Asia/Shanghai)

Production change: `weightedValue` divides by the TOTAL DECLARED weight (null dimensions keep
their weight in the denominator). Unit tests cover all/one/multiple/all-null cases plus the
Phase 5F example. No persona formulas, gates, MIN_WINNING_MATCH, parser, or pricing touched.

## BEFORE vs AFTER (same 40-wallet stratified dataset, re-run with fixed code)

| Metric | BEFORE | AFTER |
|---|---:|---:|
| Assigned | 22/40 (55.0%) | 22/40 (55.0%) |
| Newton Match >= 50 | 26 | 11 |
| Sisyphus Match >= 50 | 24 | 23 |
| NO_STRONG_MATCH | 18 | 18 |

Winner distribution BEFORE: caesar×9, newton×4, don_quixote×1, sisyphus×6, icarus×1, napoleon×1

Winner distribution AFTER: caesar×8, sisyphus×6, newton×5, icarus×1, napoleon×1, don_quixote×1

### Winner changes

- T7: — -> newton [live-data drift detected on untouched personas]
- M3: caesar -> — (NO_STRONG_MATCH) [live-data drift detected on untouched personas]

### Match changes >= 10 points

- T2 newton: 91 -> 9 (-82) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- T2 icarus: 2 -> 25 (+23) — shared weightedValue fix on a null dimension, or live-data drift
- T7 newton: 63 -> 73 (+10) — drift or partial-evidence renormalization change
- T7 don_quixote: — -> 12 (+12) — shared weightedValue fix on a null dimension, or live-data drift
- P2 newton: 57 -> 6 (-51) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- P4 newton: 69 -> 7 (-62) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- P5 newton: 57 -> 6 (-51) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- P9 newton: 53 -> 5 (-48) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- L5 newton: 68 -> 7 (-61) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- L6 newton: 70 -> 7 (-63) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- L7 newton: 10 -> 47 (+37) — drift or partial-evidence renormalization change
- L8 sisyphus: 67 -> 77 (+10) — drift (stagnation was measurable both runs)
- M1 newton: 51 -> 5 (-46) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- M2 newton: 56 -> 6 (-50) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- M3 sisyphus: 67 -> 56 (-11) — drift (stagnation was measurable both runs)
- M3 newton: 57 -> 5 (-52) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- M3 caesar: 50 -> 39 (-11) — shared weightedValue fix on a null dimension, or live-data drift
- M4 newton: 59 -> 6 (-53) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- M5 newton: 60 -> 6 (-54) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- M6 newton: 61 -> 7 (-54) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- M6 caesar: 28 -> 8 (-20) — shared weightedValue fix on a null dimension, or live-data drift
- M7 sisyphus: 39 -> 28 (-11) — integrity fix: null stagnation no longer renormalized
- M10 sisyphus: 79 -> 46 (-33) — integrity fix: null stagnation no longer renormalized
- M10 newton: 64 -> 6 (-58) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10
- T9 sisyphus: 38 -> 26 (-12) — integrity fix: null stagnation no longer renormalized
- T9 newton: 81 -> 8 (-73) — integrity fix: zero re-entries -> ACTIVITY-only weight 0.10

## Verification

**Newton §2:** 15 previously identified zero-reentry Match>=50 cases;
0 remain >= 50 after the fix.
- M10: 64 -> 6
- M1: 51 -> 5
- P2: 57 -> 6
- P9: 53 -> 5
- L6: 70 -> 7
- L5: 68 -> 7
- M5: 60 -> 6
- M4: 59 -> 6
- P4: 69 -> 7
- T2: 91 -> 9
- P5: 57 -> 6
- M2: 56 -> 6
- M3: 57 -> 5
- M6: 61 -> 7
- T9: 81 -> 8

**Sisyphus §3 (renormalization):** null-stagnation wallets after the fix:
- M10: 79 -> 46

## Sisyphus core-component minimum simulations (NOT implemented)

| Minimum | Sisyphus >= 50 | Eligible | Assigned | Coverage | Affected |
|---:|---:|---:|---:|---|---|
| 20 | 23 | 9 | 22 | 22/40 | none |
| 30 | 23 | 9 | 22 | 22/40 | none |
| 40 | 23 | 8 | 22 | 22/40 | none |

Decision: NOT IMPLEMENTED — no candidate (20/30/40) has a clear semantic justification; they map to arbitrary |progress| cutoffs (8%/7%/6% of volume) on a continuous scale whose existing semantic anchor is meaningfulProgressRate = 0.10 (stagnation > 0). Reported per spec; left unimplemented.

Note: weightedValue is shared infrastructure; Caesar/Croesus matches also change when one of
their dimensions is null — that is the intended semantics (missing evidence no longer donates
weight), not a formula modification. Live-data drift between runs is flagged where detected.
