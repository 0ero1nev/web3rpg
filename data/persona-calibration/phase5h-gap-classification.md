# Phase 5H — True Persona Gap Classification

Generated: 2026-10-06T08:28:45.872Z (Asia/Shanghai)

Offline classification of the 18 NO_STRONG_MATCH wallets remaining after the Phase 5G integrity
fix, using stored Phase 5C–5G data only. No scoring, eligibility, threshold, or persona changes;
no network calls; nothing implemented.

## 1–2. Wallet-by-wallet classification

| Wallet | qSwaps | Realized PnL | PnL cov | Completed | Open | Re-entries | Top persona | Match | Elig? | Classification |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| T9 | 269 | $0 | 0.33 | 0 | 258 | 0 | sisyphus | 26 | N | TRUE_PERSONA_GAP — cluster B (diversified accumulator) |
| P1 | 207 | $1769 | 0.78 | 36 | 44 | 3 | sisyphus | 44 | Y | TRUE_PERSONA_GAP — cluster A (profitable disciplined realization) |
| P3 | 41 | $89 | 0.12 | 3 | 12 | 0 | sisyphus | 34 | N | TRUE_PERSONA_GAP — cluster A (profitable disciplined realization, small scale) |
| P4 | 121 | $88 | 0.01 | 0 | 2 | 0 | sisyphus | 48 | N | TRUE_PERSONA_GAP — cluster B (diversified accumulator / partial sampler) |
| P5 | 50 | $44 | 0.05 | 0 | 8 | 0 | sisyphus | 54 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE) |
| P7 | 52 | $1 | 0.1 | 1 | 19 | 0 | sisyphus | 52 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE) |
| P8 | 151 | $1 | 0.04 | 2 | 3 | 0 | sisyphus | 86 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE) |
| P9 | 39 | $1 | 0.08 | 0 | 12 | 0 | sisyphus | 54 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE) |
| L1 | 14 | $-890 | 0.57 | 3 | 3 | 1 | newton | 60 | N | EVIDENCE_LIMITED (Newton / PARTIAL_HISTORY) |
| L7 | 23 | $21 | 0.3 | 3 | 0 | 1 | sisyphus | 57 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE + one-swap count near-miss) |
| L9 | 19 | $-22 | 0.22 | 2 | 5 | 1 | icarus | 46 | N | WEAK_OR_MIXED |
| L10 | 84 | $-19 | 0.32 | 1 | 14 | 0 | sisyphus | 61 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE) |
| M3 | 43 | $1 | 0.3 | 0 | 6 | 0 | sisyphus | 56 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE) |
| M4 | 56 | — | 0 | 0 | 0 | 0 | sisyphus | 20 | N | TRUE_PERSONA_GAP — cluster B (diversified accumulator) |
| M5 | 64 | — | 0 | 0 | 1 | 0 | sisyphus | 26 | N | TRUE_PERSONA_GAP — cluster B (diversified accumulator) |
| M6 | 107 | — | 0 | 0 | 0 | 0 | sisyphus | 32 | N | TRUE_PERSONA_GAP — cluster B (diversified accumulator) |
| M7 | 74 | — | 0 | 7 | 9 | 0 | caesar | 47 | N | WEAK_OR_MIXED |
| M8 | 74 | $0 | 0.08 | 1 | 20 | 0 | sisyphus | 59 | N | EVIDENCE_LIMITED (Sisyphus / PRICE_COVERAGE) |

### T9 [T] — TRUE_PERSONA_GAP
- Failure reason: All matches <27 post-fix; systematic accumulation has no archetype (Caesar=concentration, Sisyphus=grind cycles, DQ=severe loss held)
- Summary: Extreme diversified accumulator: 269 swaps across 259 tokens, zero completed positions, zero re-entries, $0.21 realized.

### P1 [P] — TRUE_PERSONA_GAP
- Failure reason: Best fits are Sisyphus@44 / Newton@36 — both semantically wrong for a consistently profitable, low-FOMO, diversified trader
- Summary: Profitable trader with disciplined exits: +$1,769 realized at 0.78 coverage, 36 completed positions, re-entry rate 0.08, 93 tokens, no severe loser, no concentration.

### P3 [P] — TRUE_PERSONA_GAP
- Failure reason: Sisyphus@34 top — but the wallet takes profits (+$89 realized); no persona rewards disciplined realization
- Summary: Small-scale disciplined realizer: +$89 at 0.12 coverage, 3 completed exits, zero re-entries, 30 tokens.

### P4 [P] — TRUE_PERSONA_GAP
- Failure reason: Sisyphus@48 (ineligible AND semantically wrong: +$88 realized profit); no persona fits buy-and-partially-harvest behavior
- Summary: Diversified sampler: 121 swaps, 67 tokens, zero completed exits, small realized profits ($88) from partial sells only.

### P5 [P] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 54 but realizedPnl coverage 0.05 < 0.5
- Summary: Buyer of 17 tokens with small realized profit ($44) from partials; stagnation signal measurable, exits unvalued.
- Evidence detail: resembles **Sisyphus**; missing: Valuation of the 2 completed-partial episodes (PRICE_COVERAGE); would-cover if available: **YES**

### P7 [P] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 52 but realizedPnl coverage 0.10 < 0.5
- Summary: Borderline grinder (37 tokens, $1.1 realized on $1.5k volume); match sits just above the assignment floor.
- Evidence detail: resembles **Sisyphus**; missing: Valuation of completed exits (PRICE_COVERAGE); would-cover if available: **MAYBE**

### P8 [P] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 86 (stagnation 99.7 measured) but realizedPnl coverage 0.04 < 0.5 gate
- Summary: Very active grinder (151 swaps, 13 tokens) whose economic stagnation is measured and extreme; only the valuation coverage of completed exits is missing.
- Evidence detail: resembles **Sisyphus**; missing: USD valuation on completed exits (PnL coverage 0.04 vs 0.5) (PRICE_COVERAGE); would-cover if available: **YES**

### P9 [P] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 54 but realizedPnl coverage 0.08 < 0.5
- Summary: Diversified sampler (19 tokens, 12 open, $0.72 realized) — thin but present stagnation evidence.
- Evidence detail: resembles **Sisyphus**; missing: Priced disposals (0 completed positions) (PRICE_COVERAGE); would-cover if available: **YES**

### L1 [L] — EVIDENCE_LIMITED
- Failure reason: Newton Match 60 but reentryCount 1 < 2 (single exit->re-entry pair, priced, strongly higher)
- Summary: Losing trader (-$890, 0.57 coverage) with ONE textbook higher-price re-entry; a second pair would complete Newton's evidence.
- Evidence detail: resembles **Newton**; missing: A second exit->re-entry pair (only 1 observed in the capped window) (PARTIAL_HISTORY); would-cover if available: **MAYBE**

### L7 [L] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 57 but qualifyingSwaps 23 < 25 AND realizedPnl coverage 0.30 < 0.5
- Summary: Profitable small trader ($21 on $9.5k) with measured stagnation; blocked by coverage and exactly one swap under the activity minimum.
- Evidence detail: resembles **Sisyphus**; missing: Exit valuation; swap-count window (23/25 under a 1,000-tx cap) (PRICE_COVERAGE + PARTIAL_HISTORY); would-cover if available: **MAYBE**

### L9 [L] — WEAK_OR_MIXED
- Failure reason: Icarus@46 (peaks only +6.3%/+3.1% — far under the +100% archetype), Sisyphus@41; nothing distinctive
- Summary: Small churning loser (-$22 on $712 volume): moderate activity, moderate loss, peaks too small for Icarus, no coherent pattern.

### L10 [L] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 61 but realizedPnl coverage 0.32 < 0.5
- Summary: Active loser (-$18.6 on $6.3k volume, 24 tokens) with measured stagnation; exits exist but are under-valued.
- Evidence detail: resembles **Sisyphus**; missing: USD valuation on the single completed exit and partial sells (PRICE_COVERAGE); would-cover if available: **YES**

### M3 [M] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 56 but realizedPnl coverage 0.30 < 0.5
- Summary: Small-scale grinder ($0.64 on $212 volume); Caesar@50 winner lost to live drift between runs.
- Evidence detail: resembles **Sisyphus**; missing: Valuation coverage of partial sells (0 completed positions) (PRICE_COVERAGE); would-cover if available: **YES**

### M4 [M] — TRUE_PERSONA_GAP
- Failure reason: Sisyphus@20; no exits, no re-entries, no concentration — no existing archetype for pure accumulation
- Summary: Pure buy-only collector: 56 swaps, 53 tokens, no sells at all, $37 volume.

### M5 [M] — TRUE_PERSONA_GAP
- Failure reason: Sisyphus@26; identical shape — accumulation without disposal
- Summary: Buy-only collector: 64 swaps, 30 tokens, 1 open position, no disposals.

### M6 [M] — TRUE_PERSONA_GAP
- Failure reason: Sisyphus@32; accumulation shape, nothing priced to grind
- Summary: Buy-only collector: 107 swaps, 33 tokens, $5.8k volume, no disposals.

### M7 [M] — WEAK_OR_MIXED
- Failure reason: Caesar@47 (diversified across 40 tokens — concentration is semantically wrong); everything else <31
- Summary: Moderately active, diversified, PnL unmeasurable (0 priced episodes): no distinctive repeated pattern.

### M8 [M] — EVIDENCE_LIMITED
- Failure reason: Sisyphus Match 59 but realizedPnl coverage 0.08 < 0.5
- Summary: Flat grinder ($0.00 realized on $65 volume, 35 tokens, 20 open) — signal present, coverage missing.
- Evidence detail: resembles **Sisyphus**; missing: Priced completed disposals (1 completed position) (PRICE_COVERAGE); would-cover if available: **YES**

Turnover/concentration scores were never captured in 5C–5G outputs; swaps-per-token and token counts serve as labeled proxies.

## 3. Evidence-limited breakdown

| Wallet | Resembles | Missing evidence | Source | Would cover? |
|---|---|---|---|---|
| P5 | Sisyphus | Valuation of the 2 completed-partial episodes | PRICE_COVERAGE | YES |
| P7 | Sisyphus | Valuation of completed exits | PRICE_COVERAGE | MAYBE |
| P8 | Sisyphus | USD valuation on completed exits (PnL coverage 0.04 vs 0.5) | PRICE_COVERAGE | YES |
| P9 | Sisyphus | Priced disposals (0 completed positions) | PRICE_COVERAGE | YES |
| L1 | Newton | A second exit->re-entry pair (only 1 observed in the capped window) | PARTIAL_HISTORY | MAYBE |
| L7 | Sisyphus | Exit valuation; swap-count window (23/25 under a 1,000-tx cap) | PRICE_COVERAGE + PARTIAL_HISTORY | MAYBE |
| L10 | Sisyphus | USD valuation on the single completed exit and partial sells | PRICE_COVERAGE | YES |
| M3 | Sisyphus | Valuation coverage of partial sells (0 completed positions) | PRICE_COVERAGE | YES |
| M8 | Sisyphus | Priced completed disposals (1 completed position) | PRICE_COVERAGE | YES |

7 of 9 are the Phase 5E Sisyphus PRICE_COVERAGE family (matches 52-86 already above 50); the other two are Newton (L1, needs a second re-entry pair) and the combined-cause L7. No gate loosening is suggested.

## 4. True-gap behavior clusters

### Cluster A — profitable disciplined realization
- Wallets: P1, P3 (n=2)
- Shared behavior: consistent realized profit, multiple completed exits, near-zero re-entry (no FOMO), diversified, no severe long-held loser, no concentration
- Key metrics: P1: +$1,769 @ 0.78 PnL coverage, 36 exits, re-entry rate 0.08; P3: +$89 @ 0.12 coverage, 3 exits, 0 re-entries
- Why none of the 8 fit: Sisyphus rewards stagnation (these wallets progress), Midas rewards UNREALIZED holdings (these realize), Newton/Icarus require re-entry/giveback (absent by discipline), Caesar/Croesus require concentration/size (absent by diversification), DQ/Napoleon require losses (absent)
- Missing behavioral concept: a persona for taking profits well: frequent meaningful realized gains, low higher-price re-entry, limited giveback, not dependent on concentration

### Cluster B — diversified accumulator / many-bet sampler
- Wallets: T9, P4, M4, M5, M6 (n=5)
- Shared behavior: systematic diversified buying (17-259 tokens), zero completed exit cycles, zero re-entries, no concentration in any single asset
- Key metrics: T9: 259 tokens/0 exits; M4/M5/M6: buy-only, no sells; P4: partial-profit harvesting without full exits (+$88 realized)
- Why none of the 8 fit: Caesar is the anti-shape (single-bag concentration), Sisyphus needs grind-to-zero cycles (no exits exist), Midas needs profitable open holdings with current value (unpriced), Newton/DQ/Icarus need exit behavior that never occurs
- Missing behavioral concept: a persona for spread-many-bets accumulation: many small diversified positions, patient holding, no disposal discipline implied
- Caveat: partial-history caveat: with a 1,000-tx cap, 'never exits' is observed only within the window; longer histories could reveal disposal

## 5. Weak / mixed

L9 and M7: enough observable behavior, no coherent repeated pattern. Explicitly left as NO_STRONG_MATCH —
a persona must represent a recognizable pattern, not fill every wallet.

## 6. Coverage decomposition

| Bucket | Wallets |
|---|---:|
| Assigned | 22 |
| Evidence limited | 9 |
| True persona gap | 7 |
| Weak / mixed | 2 |
| Total | 40 |

- CURRENT assignment coverage: **22/40 (55.0%)**
- THEORETICAL persona coverage (assigned + coherent gap clusters, evidence-limited excluded): **29/40 (72.5%)**

## 7. Persona expansion decision

**Do we have evidence for adding Persona #9? YES** — and a second archetype is also supported.

1. **Disciplined profitable exit trader: frequently realizes meaningful profits, low higher-price re-entry, limited giveback, diversified rather than concentrated.** — plausibly covers 2 wallets (5.0% of the 40); strongest example P1.
2. **Diversified accumulator / many-bet sampler: systematic spread of small positions, no exit cycles, no re-entry, no concentration.** — plausibly covers 5 wallets (12.5%); strongest example T9.

Caution: Cluster B rests on absence-of-exit evidence inside a capped window; Cluster A is only 2 wallets. Neither is named, nothing is implemented.

No historical figure selected; no scoring, threshold, or eligibility change; analysis only.
