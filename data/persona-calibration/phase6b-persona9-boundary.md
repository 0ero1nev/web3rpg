# Phase 6B — Persona #9 Boundary Validation

Generated: 2026-10-06T08:40:41.486Z (Asia/Shanghai)

Offline audit of the 10 simulated matches against stored Phase 5C–5G data. No production changes,
no threshold tuning, no formula changes, no network.

## 1. All 10 matched wallets

| Wallet | qSwaps | Tokens | s/t | Completed | Open | Re | Episodes(≥) | PnL (cov) | BREADTH | CYCLE_SCARCITY | TILT | #9 Match | Current winner | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---|
| T9 | 269 | 259 | 1.04 | 0 | 258 | 0 | 258 | $0 (0.33) | 100 | 100 | 100 | 100 | NONE | **TRUE_MATCH** |
| P4 | 121 | 67 | 1.81 | 0 | 2 | 0 | 2 | $88 (0.01) | 91.4 | 100 | 100 | 97 | NONE | **TRUE_MATCH** |
| M4 | 56 | 53 | 1.06 | 0 | 0 | 0 | 0 | — (0) | 86.4 | 100 | null | 65.3 | NONE | **AMBIGUOUS** |
| M5 | 64 | 30 | 2.13 | 0 | 1 | 0 | 1 | — (0) | 74.4 | 100 | 100 | 91 | NONE | **AMBIGUOUS** |
| M6 | 107 | 33 | 3.24 | 0 | 0 | 0 | 0 | — (0) | 76.4 | 100 | null | 61.7 | NONE | **AMBIGUOUS** |
| L5 | 109 | 48 | 2.27 | 0 | 1 | 0 | 1 | $-162 (0.01) | 84.3 | 100 | 100 | 94.5 | caesar@70 | **AMBIGUOUS** |
| L6 | 126 | 48 | 2.63 | 0 | 5 | 0 | 5 | $-141 (0.04) | 84.3 | 100 | 100 | 94.5 | don_quixote@99 | **AMBIGUOUS** |
| P7 | 52 | 37 | 1.41 | 1 | 19 | 0 | 20 | $1 (0.1) | 78.8 | 50 | 95 | 73.6 | NONE | **TRUE_MATCH** |
| M8 | 74 | 35 | 2.11 | 1 | 20 | 0 | 21 | $0 (0.08) | 77.6 | 50 | 95.2 | 73.2 | NONE | **TRUE_MATCH** |
| L10 | 84 | 24 | 3.5 | 1 | 14 | 0 | 15 | $-19 (0.32) | 69.7 | 50 | 93.3 | 69.9 | NONE | **AMBIGUOUS** |

BUY/SELL/ADD/PARTIAL_SELL/EXIT counts: **UNKNOWN** — per-leg event counts were never stored. Derivable
identity only: firstAcquisitions ≤ tokens; ADDs ≈ qSwaps − tokens − disposalLegs; disposalLegs ≥ 1 iff
priced realized PnL exists (true for P4, L5, L6, P7, M8, L10).

## 2. What does 'low cycling' mean here?

- Available offline: trade legs per token (qSwaps/tokens); open/(open+completed) tilt; completed/reentry counts.
- Unknown offline: BUY/SELL/ADD/PARTIAL_SELL/EXIT leg counts; direction changes; BUY->SELL and SELL->BUY transitions; per-token repeat interaction distribution.
- Conclusion: For wallets whose episodes are still open (T9, P7, M8) swaps-per-token near 1 plus living holdings supports 'collects without re-trading'. For vanished-position wallets (M4, M5, M6, L5) the stored data CANNOT distinguish 'collects without re-trading' from 'rarely reaches zero inventory' — exactly the §2 ambiguity — so they are classified AMBIGUOUS rather than validated.

## 3. Audit of the five extra matches

- **L5 — AMBIGUOUS (PARTIAL_HISTORY_SENSITIVE)**: 48 tokens at 2.27 s/t, 47 positions vanished without EXIT, -$162 realized at 0.01 coverage, currently Caesar@70 via repeated adds — Persona #9 at 94.5 would STEAL it on ambiguous evidence.
- **L6 — AMBIGUOUS (AMBIGUOUS)**: structurally a broad holder (48 tokens, 0 cycles) AND the Don Quixote archetype (-96.3% held 627 days); DQ@99 outmatches #9@94.5 so assignment is unchanged, but the wallet proves archetype overlap, not a clean boundary.
- **P7 — TRUE_MATCH (ROBUST_IN_WINDOW)**: 37 tokens at 1.41 s/t with 19/20 episodes still open: a genuine broad sampler whose low repetition (not missing PnL) makes #9 more behaviorally specific than its thin Sisyphus stagnation evidence (Match 52).
- **M8 — TRUE_MATCH (ROBUST_IN_WINDOW)**: 35 tokens at 2.11 s/t with 20/21 episodes open: broad sampler-with-adds; Sisyphus competition (Match 59, coverage 0.08) noted.
- **L10 — AMBIGUOUS (AMBIGUOUS)**: 24 tokens at 3.50 s/t is the highest repetition of the ten — a repetitive-trader reading (Sisyphus Match 61 at 0.32 coverage, 1 completed cycle) is at least as plausible as the sampler reading; not resolvable offline.

P7/M8/L10 vs their Sisyphus evidence-limited classification: P7 and M8 are genuine broad samplers
(1.41 / 2.11 swaps-per-token, 19-20 of episodes still open) — Persona #9 is behaviorally MORE specific than
thin-evidence stagnation, so TRUE_MATCH with the Sisyphus competition recorded. L10's 3.50 swaps-per-token
makes the repetitive-trader reading (Sisyphus 61 @ 0.32 coverage) at least as plausible: AMBIGUOUS.
Missing PnL was not used as evidence for #9 in any verdict.

## 4. Control examples

| Wallet | Persona (match) | Tokens | s/t | Completed+Re | #9 eligible? | #9 Match | Why not absorbed |
|---|---|---:|---:|---:|---|---:|---|
| T4 | sisyphus@94 | 3 | 174.67 | 516 | N | 10.7 | breadth floor fails (3 tokens < 20) |
| T1 | caesar@61 | 13 | 44.23 | 2 | N | 55.7 | breadth floor fails (13 tokens < 20) |
| T3 | sisyphus@73 | 70 | 7.53 | 166 | N | 37.8 | breadth floor fails (70 tokens < 20) |
| T2 | caesar@81 | 8 | 77.88 | 0 | N | 81.7 | breadth floor fails (8 tokens < 20) |

T4 (Sisyphus@94): 3 tokens, 516 cycles — CYCLE_SCARCITY 0.2, breadth floor fails. T1 (Caesar@61):
13 tokens — breadth floor fails. T3 (Sisyphus@73): 70 tokens but 166 cycles — scarcity collapses. T2
(Caesar@81): 8 tokens — breadth floor fails. L6 stays Don Quixote because 99 > 94.5.

## 5. Partial-history status

- T9: **ROBUST_IN_WINDOW** — 259 tokens at 1.04 swaps/token (each asset visited ~once) and 258 episodes still open in current holdings — accumulation is alive, not inferred.
- P4: **ROBUST_IN_WINDOW** — 67 tokens at 1.81 s/t, 2 open; partial profit harvesting ($88 realized) is repeat trading but stays a sampler-with-harvest shape; would keep Match 77 under the proposed cycling correction.
- M4: **PARTIAL_HISTORY_SENSITIVE** — 53 tokens at 1.06 s/t but completed=0 AND open=0 — every position vanished without an EXIT event (sold before window / transferred / dusted); disposition unknown, so 'accumulator' rests on breadth alone.
- M5: **PARTIAL_HISTORY_SENSITIVE** — 30 tokens at 2.13 s/t but 29 of 30 positions vanished without EXIT; only 1 open episode remains.
- M6: **PARTIAL_HISTORY_SENSITIVE** — 33 tokens at 3.24 s/t (repeat ADDs), completed=0 AND open=0 — all positions vanished unobserved.
- L5: **PARTIAL_HISTORY_SENSITIVE** — 48 tokens at 2.27 s/t, 47 positions vanished without EXIT, -$162 realized at 0.01 coverage, currently Caesar@70 via repeated adds — Persona #9 at 94.5 would STEAL it on ambiguous evidence.
- L6: **AMBIGUOUS** — structurally a broad holder (48 tokens, 0 cycles) AND the Don Quixote archetype (-96.3% held 627 days); DQ@99 outmatches #9@94.5 so assignment is unchanged, but the wallet proves archetype overlap, not a clean boundary.
- P7: **ROBUST_IN_WINDOW** — 37 tokens at 1.41 s/t with 19/20 episodes still open: a genuine broad sampler whose low repetition (not missing PnL) makes #9 more behaviorally specific than its thin Sisyphus stagnation evidence (Match 52).
- M8: **ROBUST_IN_WINDOW** — 35 tokens at 2.11 s/t with 20/21 episodes open: broad sampler-with-adds; Sisyphus competition (Match 59, coverage 0.08) noted.
- L10: **AMBIGUOUS** — 24 tokens at 3.50 s/t is the highest repetition of the ten — a repetitive-trader reading (Sisyphus Match 61 at 0.32 coverage, 1 completed cycle) is at least as plausible as the sampler reading; not resolvable offline.

## 6. Formula decision

**YES_WITH_MINOR_CHANGE** — replace CYCLE_SCARCITY = 100/(1 + completedPositions + reentries) with CYCLING_SCARCITY = 100/(1 + disposalLegs + reentryLegs), where disposalLegs = PARTIAL_SELL + EXIT legs.
Justification: the archetype sentence is 'continues adding new assets rather than repeatedly TRADING the same asset'; a BUY -> PARTIAL_SELL -> ADD -> PARTIAL_SELL loop is repeat trading even though it never reaches a full EXIT. Counting only completed positions measures 'rarely reaches zero inventory', not 'rarely re-trades'. ADDs remain acceptable (accumulating more of a held asset is collector-consistent).
Not wallet-targeted: the correction is derived from the archetype definition and the phase's own BUY/PARTIAL_SELL/ADD example; it is NOT chosen to exclude or keep any specific wallet (bounded offline effect: P4 97->77, P7 73.6->71, M8 73.2->70.6 still assign; heavier partial cyclers would fall at implementation time when leg counts exist)

## 7. Expected production effect (stored data, current 6A formula)

- Eligible with #9 Match >= 50: **10**
- Newly assigned (were NO_STRONG_MATCH): **8**
- Stolen from existing winners: L5: caesar@70 -> #9@94.5
- Coverage: current 22/40 -> raw 30/40 (75.0%); **validated-only 26/40 (65.0%) (ambiguity excluded per phase rules)**

Validated split: TRUE_MATCH T9, P4, P7, M8; AMBIGUOUS M4, M5, M6, L5, L6, L10; FALSE_POSITIVE none.

---

## FORMULA DECISION

YES_WITH_MINOR_CHANGE: replace CYCLE_SCARCITY = 100/(1 + completedPositions + reentries) with CYCLING_SCARCITY = 100/(1 + disposalLegs + reentryLegs), where disposalLegs = PARTIAL_SELL + EXIT legs

## VALIDATED MATCHES

T9 (#9 Match 100), P4 (#9 Match 97), P7 (#9 Match 73.6), M8 (#9 Match 73.2)

## FALSE POSITIVES

None confirmed. No matched wallet is behaviorally CONTRARY to the archetype; the failures are evidentiary, not behavioral.

## AMBIGUOUS MATCHES

M4 — PARTIAL_HISTORY_SENSITIVE; M5 — PARTIAL_HISTORY_SENSITIVE; M6 — PARTIAL_HISTORY_SENSITIVE; L5 — PARTIAL_HISTORY_SENSITIVE; L6 — AMBIGUOUS; L10 — AMBIGUOUS

## EXPECTED COVERAGE

Raw: 30/40 (75.0%). Validated (ambiguity excluded): **26/40 (65.0%) (ambiguity excluded per phase rules)**. One steal risk: L5 (Caesar@70 -> #9@94.5) on ambiguous evidence.

## IMPLEMENTATION RECOMMENDATION

Implement only after (1) adopting the CYCLING_SCARCITY correction, (2) capturing per-leg event counts
(BUY/SELL/ADD/PARTIAL_SELL/EXIT) and open-episode-in-holdings flags in the analysis output so vanished-
position wallets can be resolved, and (3) deciding the Sisyphus routing rule for overlap wallets.
With those, expect validated coverage in the mid-60% range rather than the raw 75%.

No production changes were made.
