# Phase 4A deterministic Persona scoring — A/B/C/D validation

This validation uses the saved 1,000-transaction A–D windows, Phase 3 historical execution valuation, and the unchanged Phase 2 position engine. Only Sisyphus, Newton, Caesar, and Croesus are implemented. Scores were not manually overridden to create variety.

## Results

| Wallet | Sisyphus | Newton | Caesar | Croesus | Winner | Winner confidence |
|---|---:|---:|---:|---:|---|---:|
| A | 63 | 73 | 43 | 36 | Newton | 90 |
| B | 87 | 79† | 84 | 73 | Sisyphus | 83 |
| C | 60 | 54 | 34 | 8 | Sisyphus | 85 |
| D | 90† | 59 | 74 | 35 | Caesar | 87 |

† Ineligible. An ineligible score is diagnostic only and cannot win. B's Newton result lacks completed positions and priced re-entry pairs. D's Sisyphus-like match is strong, but PnL coverage is only 23.3%, below the 50% eligibility floor.

## Why each wallet won

### A — Newton, 73 match / 90 confidence

A has 12 re-entries following 49 conservatively completed position episodes. Nine of the 12 priced re-entries occurred at a higher execution price, and the median re-entry premium was +28.7%. Sisyphus remains a plausible runner-up at 63, but the repeated higher-price return pattern is the stronger directly observed behavior.

### B — Sisyphus, 87 match / 83 confidence

B combines 229 qualifying swaps, a 96.2% repeated-trade rate, and very high turnover across only nine assets. Observed progress efficiency is +1.68% on 75% PnL coverage: substantial repeated activity produced comparatively little economic progress. Caesar is close at 84 because valued acquisitions are highly concentrated (84.5%) and include 111 ADD events; the three-point margin is a genuine model result rather than a manual tie-break.

### C — Sisyphus, 60 match / 85 confidence

C has the highest activity in the sample at 710 qualifying swaps and a 71.2% repeated-trade rate. Its observed progress efficiency is -3.76% with 82.0% PnL coverage, producing a moderate stagnation match rather than a maximum score: the economic movement is meaningfully negative, not simply near zero. Newton scores 54 because only 15 of 49 priced re-entries were higher, with a median re-entry premium of -8.8%.

### D — Caesar, 74 match / 87 confidence

D's valued acquisitions have 65.0% concentration, its largest valued position accounts for 77.8%, and it contains 100 ADD events across a small 11-token set. Newton reaches 59, but only two of 12 priced re-entries were higher and the median premium was -3.6%. Its raw Sisyphus match is 90 because progress is near zero, but that result is correctly ineligible: only 28 of 120 reconstructed sells have reliable PnL.

## Normalized behavior dimensions

All behavior dimensions use `value: number | null`, `confidence: 0–100`, `sampleSize`, and evidence. Missing inputs stay null.

- Shared count normalization: `100 × clamp(log(1+x) / log(1+reference), 0, 1)`.
- Shared positive range normalization: `100 × clamp((log(x)-log(min)) / (log(max)-log(min)), 0, 1)`.
- Smooth saturation: `100 × (1-exp(-x/scale))`.
- Activity: log-count of qualifying swaps, reference 1,000.
- Turnover: the Phase 2 score `100 × (1-exp(-average trade legs per token / 10))`.
- Repetition: saturation of `average trades per token - 1`, scale 6. The repeated-leg rate is retained as evidence.
- Concentration: priced acquisition HHI × 100.
- Diversification: log-count of traded tokens, reference 100.
- Re-entry: 50% re-entry count normalization (reference 10) plus 50% re-entry/completed-position rate.
- FOMO re-entry: 25% priced re-entry count, 50% higher-price rate, and 25% positive median premium saturation at +50%. Negative median premiums receive no FOMO-premium strength.
- Holding: log-count of median holding seconds, reference 30 days.
- Profitability: `50 + 50 × tanh(progress efficiency / 5%)`; this preserves direction.
- Efficiency: `100 × clamp(abs(progress efficiency) / 10%, 0, 1)`. Sisyphus uses `100 - efficiency` as stagnation, so large losses do not become maximum stagnation.
- Trade size: median valued swap on a logarithmic $10–$100,000 range.
- Risk expansion: 45% ADD-count normalization, 35% ADD/buy rate, and 20% tokens with repeated additions.

## Persona formulas and eligibility

- Sisyphus: 30% Activity, 20% Turnover, 20% Repetition, 30% Stagnation. Requires at least 25 swaps, non-null economic progress, and at least 50% PnL coverage.
- Newton: 35% Re-entry, 55% FOMO Re-entry, 10% Activity. Requires at least ten swaps, completed positions, two re-entries, and two priced exit/re-entry pairs.
- Caesar: 35% Concentration, 15% inverse Diversification, 35% Risk Expansion, 15% Repetition. Requires at least 50% priced acquisition coverage, three ADD events, and repeated additions to one asset.
- Croesus: 55% observed-volume log score ($1,000–$10M), 30% median Trade Size, 15% largest-trade log score ($100–$1M). Requires ten valued swaps and at least 50% volume coverage. Current wallet balance is not used.

Persona confidence is the weighted confidence of its dimensions. Partial history applies a 10% confidence penalty but does not change match. Ranking considers eligible results only, and no winner is returned when none are eligible.

## Limitations

- Scores describe the fixed 1,000-transaction windows, not wallet lifetime behavior.
- Observed PnL is still a priced subset when PnL coverage is below 100%.
- The initial normalization references are explicit configuration values, not population percentiles. They should eventually be calibrated against a broad, versioned wallet cohort.
- Ineligible scores remain visible for debugging, but cannot win.
- Icarus, Midas, Don Quixote, and Napoleon are intentionally not implemented.
- No collectible card rendering or Persona-driven pack behavior was added.
