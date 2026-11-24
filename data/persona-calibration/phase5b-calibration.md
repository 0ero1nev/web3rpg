# Phase 5B — Minimal Persona Calibration (BEFORE vs AFTER)

Generated: 2026-10-05T17:21:03.684Z (Asia/Shanghai)

Same 44-wallet Phase 5 dataset, unchanged parser/valuation pipeline. Scoring changes:
wallet-level `INSUFFICIENT_HISTORY` (< 10 qualifying swaps), `MIN_WINNING_MATCH = 50`
winner gate, and continuous Don Quixote loss × persistence scoring. Sisyphus, Newton,
Caesar, Croesus, Icarus, Midas, and Napoleon formulas are untouched; Icarus untouched explicitly.

## Result reason distribution

| Result | BEFORE | AFTER |
|---|---:|---:|
| Assigned winner | 18 | 11 |
| NO winner | 26 | 33 |
| — INSUFFICIENT_HISTORY | n/a | 26 |
| — NO_ELIGIBLE_PERSONA | 26 (combined) | 0 |
| — NO_STRONG_MATCH | n/a | 7 |

## Winner distribution

| Persona | BEFORE | AFTER |
|---|---:|---:|
| sisyphus | 4 | 4 |
| newton | 2 | 1 |
| caesar | 6 | 5 |
| croesus | 6 | 0 |
| icarus | 0 | 1 |
| midas | 0 | 0 |
| don_quixote | 0 | 0 |
| napoleon | 0 | 0 |
| (no winner) | 26 | 33 |

## Don Quixote

| Metric | BEFORE | AFTER |
|---|---:|---:|
| Measurable | 33/44 | 32/44 |
| Non-zero Match | 0/44 | 3/44 |
| Eligible | 0/44 | 3/44 |
| Match ≥ 50 | n/a | 1/44 |
| Wins | 0 | 0 |

Strongest continuous Don Quixote evidence in AFTER:

| Wallet | Return | Held (days) | DQ Match |
|---|---:|---:|---:|
| W13 | -50.9% | 39.2 | 63 |
| W39 | -38.5% | 4.5 | 34 |
| W30 | -0.0% | 3 | 1 |

## Wallets whose assigned winner changed

| Wallet | BEFORE | AFTER | AFTER reason | DQ before → after | Untouched-persona drift? |
|---|---|---|---|---|---|
| W12 | croesus | — | NO_STRONG_MATCH | — → — | no |
| W13 | caesar | icarus | ASSIGNED | 0 → 63 | YES |
| W14 | croesus | — | NO_STRONG_MATCH | 0 → 0 | no |
| W15 | newton | — | NO_STRONG_MATCH | 0 → 0 | no |
| W17 | croesus | — | NO_STRONG_MATCH | 0 → — | YES |
| W20 | croesus | — | NO_STRONG_MATCH | 0 → 0 | YES |
| W26 | croesus | — | NO_STRONG_MATCH | 0 → 0 | no |
| W39 | croesus | — | NO_STRONG_MATCH | 0 → 34 | no |

Drift = any untouched persona Match moved ≥ 2 points between runs (provider data is live),
so winner changes on drifted wallets may not be attributable to the rule change alone.

## Notes

- Icarus scoring and thresholds are untouched; W34/W13-class evidence still resolves the same way.
- The 20-request historical-price budget and the 10-swap general minimum are unchanged.
- If Don Quixote remains near zero after continuous scoring, that is reported as-is; no further loosening.

## Attribution notes

- The 26 INSUFFICIENT_HISTORY wallets are exactly the 26 wallets that had no
  eligible Persona in Phase 5: every Persona eligibility rule already required
  ≥ 10 qualifying swaps, so the old "NO_ELIGIBLE_PERSONA" bucket was entirely
  tiny-history wallets. NO_ELIGIBLE_PERSONA drops to 0 because the label now
  names the actual cause.
- All 7 NO_STRONG_MATCH wallets are former default winners: 6 Croesus wins with
  Match 0–36 and 1 Newton win at Match 40. W17 is the spec's exact scenario —
  Croesus eligible at Match 6 while Newton 53 / Icarus 51 were ineligible — and
  it now correctly refuses to assign. Wallets A (Newton 73) and the other ≥ 50
  winners are unchanged.
- W13's winner flip (Caesar → Icarus) is live-data drift on an untouched
  formula: Icarus moved 55 → 68 (BULLISH kept giving back) and crossed Caesar's
  62. Its Don Quixote 0 → 63, however, is the continuous-scoring change: a
  −50.9% position held 39 days scores √(0.53 × 0.77) ≈ 63, while the old
  binary −50%/30-day gate had it just outside at ~−49%.
- Don Quixote after continuous scoring: 3/44 non-zero, 1/44 ≥ 50 (W13), 0 wins.
  Reported as-is per the phase rules; no further loosening was applied.
- Icarus, Sisyphus, Newton, Caesar, Midas, Napoleon, and Croesus formulas, the
  20-request budget, and the 10-swap minimum are byte-identical to Phase 5.
