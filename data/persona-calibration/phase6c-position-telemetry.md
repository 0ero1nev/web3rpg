# Phase 6C — Position Action Telemetry

Generated: 2026-10-06T12:45:25.139Z (Asia/Shanghai)

Telemetry implemented in the behavior engine and exposed via WalletProfile.positionTelemetry.
Scoring, eligibility, thresholds, parser, and valuation are untouched. Persona #9 remains offline-only.

## Telemetry for the 10 candidates

| Wallet | Tokens | s/t | BUY | ADD | PSELL | EXIT | RE | disposal | cycling | repRate | hiRepRate | OPEN | EXIT-ep | UNRESOLVED | UNKNOWN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| T9 | 279 | 1.05 | 277 | 13 | 4 | 0 | 0 | 4 | 4 | 0.047 | 0.007 | 276 | 0 | 1 | 2 |
| P4 | 70 | 1.71 | 4 | 1 | 116 | 0 | 0 | 116 | 116 | 0.414 | 0.186 | 2 | 0 | 0 | 68 |
| M4 | 53 | 1.06 | 0 | 0 | 56 | 0 | 0 | 56 | 56 | 0.057 | 0 | 0 | 0 | 0 | 53 |
| M5 | 30 | 2.23 | 1 | 0 | 67 | 0 | 0 | 67 | 67 | 0.6 | 0.3 | 1 | 0 | 0 | 29 |
| M6 | 47 | 4.19 | 0 | 0 | 197 | 0 | 0 | 197 | 197 | 0.553 | 0.426 | 0 | 0 | 0 | 47 |
| L5 | 46 | 2.41 | 1 | 31 | 79 | 0 | 0 | 79 | 79 | 0.37 | 0.239 | 1 | 0 | 0 | 45 |
| L6 | 48 | 2.65 | 11 | 12 | 104 | 0 | 0 | 104 | 104 | 0.5 | 0.313 | 5 | 0 | 0 | 43 |
| P7 | 37 | 1.41 | 22 | 6 | 30 | 1 | 0 | 31 | 31 | 0.324 | 0.108 | 19 | 1 | 15 | 2 |
| M8 | 35 | 2.11 | 21 | 45 | 37 | 1 | 0 | 38 | 38 | 0.514 | 0.343 | 20 | 1 | 0 | 14 |
| L10 | 23 | 3.61 | 22 | 27 | 33 | 1 | 0 | 34 | 34 | 0.739 | 0.304 | 13 | 1 | 2 | 7 |

## Offline Persona #9 features (revised tilt: resolved episodes only)

| Wallet | BREADTH | CYCLING_SCARCITY | TILT(rev) | resolved | unresolved | Match | Proposed eligible | Classification |
|---|---:|---:|---:|---:|---:|---:|---|---|
| T9 | 100 | 20 | 100 | 276 | 3 | 72 | Y | **VALIDATED** |
| P4 | 92.4 | 0.9 | 100 | 2 | 68 | 62.6 | N | **REJECTED** |
| M4 | 86.4 | 1.8 | null | 0 | 53 | 30.9 | N | **REJECTED** |
| M5 | 74.4 | 1.5 | 100 | 1 | 29 | 56.6 | N | **REJECTED** |
| M6 | 83.9 | 0.5 | null | 0 | 47 | 29.5 | N | **REJECTED** |
| L5 | 83.4 | 1.3 | 100 | 1 | 45 | 59.6 | N | **REJECTED** |
| L6 | 84.3 | 1 | 100 | 5 | 43 | 59.8 | N | **REJECTED** |
| P7 | 78.8 | 3.1 | 95 | 20 | 17 | 57.2 | N | **REJECTED** |
| M8 | 77.6 | 2.6 | 95.2 | 21 | 14 | 56.6 | N | **REJECTED** |
| L10 | 68.9 | 2.9 | 92.9 | 14 | 9 | 53 | N | **REJECTED** |

Revised ACCUMULATION_TILT = 100 * observedOpen / (observedOpen + observedExit). Unresolved
disappearances and unknown opening states contribute to NEITHER side — they are not evidence of
accumulation, holding, selling, profit, or loss (partial-history safety preserved).

## Sisyphus overlap (P7 / M8 / L10)

| Wallet | Sisyphus match (elig) | pnlCov | stagnation | repRate | hiRepRate | cycling legs | #9 offline | Structural verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| P7 | 52 (N) | 0.1 | 99.3 | 0.324 | 0.108 | 31 | 57.2 | SISYPHUS-leaning |
| M8 | 59 (N) | 0.08 | 100 | 0.514 | 0.343 | 38 | 56.6 | SISYPHUS-leaning |
| L10 | 61 (N) | 0.32 | 97 | 0.739 | 0.304 | 34 | 53 | SISYPHUS-leaning |

No routing rule is created here: with correctly defined features the normal Match competition
should resolve overlap at implementation time.

## L5 safety check

observedOpen=1, unresolved=45 -> proposed eligibility FAILS. SAFE: Persona #9 is NOT eligible for L5 (observable accumulation evidence insufficient)

---

## TELEMETRY IMPLEMENTED

behaviorTypes/behaviorFeatures expose positionActions (BUY/ADD/PARTIAL_SELL/EXIT/RE_ENTRY + disposal + cycling),
assetInteraction (mean/median legs per asset, repeatedAssetRate, highlyRepeatedAssetRate), and
episodeTerminalStates (OPEN / CLOSED_BY_OBSERVED_EXIT / UNRESOLVED_DISAPPEARANCE / UNKNOWN_OPENING_STATE).
WalletProfile.positionTelemetry carries them into the API output. 8 unit tests cover the six §9 patterns.

## VALIDATED PERSONA #9 WALLETS

T9

## AMBIGUOUS WALLETS

none

## REJECTED WALLETS

P4 (offline match 62.6), M4 (offline match 30.9), M5 (offline match 56.6), M6 (offline match 29.5), L5 (offline match 59.6), L6 (offline match 59.8), P7 (offline match 57.2), M8 (offline match 56.6), L10 (offline match 53)

## SISYPHUS OVERLAP

- P7: SISYPHUS-leaning (repetition 0.324/0.108, cycling 31, stagnation 99.3 @ cov 0.1)
- M8: SISYPHUS-leaning (repetition 0.514/0.343, cycling 38, stagnation 100 @ cov 0.08)
- L10: SISYPHUS-leaning (repetition 0.739/0.304, cycling 34, stagnation 97 @ cov 0.32)

## SAFE PERSONA #9 FEATURE DEFINITION

BREADTH = logCountScore(distinctTokens, 100); CYCLING_SCARCITY = 100/(1 + disposalLegs + reentryLegs);
ACCUMULATION_TILT = 100 * observedOpen / (observedOpen + observedExit), null when no resolved episodes.
Eligibility must additionally require observedOpenEpisodeCount >= 10 so accumulation is OBSERVED, not inferred.

## READY_FOR_PERSONA_9_IMPLEMENTATION: NO

Rationale: telemetry exists and the safe feature definition is testable, but (1) eligibility additions
(observed-open floor, cycling-leg cap) and the CYCLING_SCARCITY swap still need an explicit review pass,
(2) the Sisyphus routing question for overlap wallets is unresolved, and (3) half the original discovery
cluster is now ambiguous pending better position-fate evidence. Implement after that review.
