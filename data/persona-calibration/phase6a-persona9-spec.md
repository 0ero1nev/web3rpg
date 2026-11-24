# Phase 6A — Persona #9 Behavior Spec (Cluster B: Diversified Accumulator / Collector)

Generated: 2026-10-06T08:33:59.437Z (Asia/Shanghai)

SPEC ONLY: no production scoring, no implementation, no historical figure, no changes to existing
personas. All numbers from stored Phase 5C–5G outputs.

## 1. Cluster B profiles

| Wallet | qSwaps | Tokens | Completed | Open | Re-entries | Rate | Swaps/token | PnL | Cov | History |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| P4 | 121 | 67 | 0 | 2 | 0 | n/a | 1.81 | $88 | 0.01 | PARTIAL (1,000-tx cap) |
| M4 | 56 | 53 | 0 | 0 | 0 | n/a | 1.06 | — | 0 | PARTIAL (1,000-tx cap) |
| M5 | 64 | 30 | 0 | 1 | 0 | n/a | 2.13 | — | 0 | PARTIAL (1,000-tx cap) |
| M6 | 107 | 33 | 0 | 0 | 0 | n/a | 3.24 | — | 0 | PARTIAL (1,000-tx cap) |
| T9 | 269 | 259 | 0 | 258 | 0 | n/a | 1.04 | $0 | 0.33 | PARTIAL (1,000-tx cap) |

Not captured in stored outputs (declared data gaps): ADD/BUY/SELL/EXIT event counts (bounded:
disposal legs exist only where realizedPnl is non-null — true only for P4), HHI concentration, largest
position share. Proxies used are labeled as proxies.

## 2–3. Feature separability vs the other 35 wallets

| Feature | B median | B range | Other median | Other range | Others inside B range | Strictly separated | Useful? |
|---|---:|---|---:|---|---:|---:|---|
| TOKEN_BREADTH (distinctTokens) | 53 | [30, 259] | 22 | [1, 177] | 15/35 | 30/35 | YES |
| EXIT_SCARCITY (completedPositions) | 0 | [0, 0] | 3 | [0, 259] | 11/35 | 24/35 | YES |
| REENTRY_SCARCITY (reentryCount) | 0 | [0, 0] | 0 | [0, 257] | 18/35 | 17/35 | weak alone |
| SWAPS_PER_TOKEN (repetition inverse) | 1.81 | [1.0386100386100385, 3.242424242424242] | 3.39 | [1.37, 174.67] | 16/35 | 31/35 | YES |
| CYCLES (completed + reentries) | 0 | [0, 0] | 3 | [0, 516] | 11/35 | 24/35 | YES |
| OPEN_SHARE (open / (open+completed)) | 1 | [1, 1] | 0.62 | [0, 1] | 11/35 | 24/35 | YES |

Reading: single features do NOT separate alone — several control wallets also have zero completed
positions or zero re-entries. The cluster is separated by the CONJUNCTION of breadth with cycle
scarcity, which is exactly what the proposed composite encodes.

Per-winner-group medians for context:

| Winner persona | n | median tokens | median completed | median re-entries | median swaps/token |
|---|---:|---:|---:|---:|---:|
| caesar | 8 | 9.5 | 0 | 0 | 9.72 |
| sisyphus | 6 | 20.5 | 25 | 10 | 8.40 |
| newton | 5 | 46 | 24 | 5 | 2.84 |
| icarus | 1 | 37 | 18 | 2 | 2.22 |
| napoleon | 1 | 30 | 11 | 1 | 4.17 |
| don_quixote | 1 | 48 | 0 | 0 | 2.63 |

## 4. Partial-history risk

- Safe within window: distinct-token breadth (undercounted but directionally robust); swaps-per-token repetition; re-entry scarcity (structurally tied to exit absence); accumulation tilt for positions opened in-window.
- Must NOT be treated as proof: 'never exits' as a permanent trait (right-edge truncation); any profit/skill inference; M4-style wallets where tracked amounts vanish without EXIT events (disposition unknown: sold before window, transferred, or dusted).

## 5. Proposed feature model (NOT implemented)

- **BREADTH** — source: distinctTokens (tradedTokenCount); normalization: logCountScore(tokens, 100) — reuses the existing diversificationReferenceTokens anchor; semantics: how many distinct assets the wallet trades; null: never null; 0 tokens -> 0.
- **CYCLE_SCARCITY** — source: completedPositions + reentryCount; normalization: 100 / (1 + completed + reentries); semantics: absence of exit/re-entry cycles (100 = none observed in window); null: never null; cycles unbounded denominator.
- **ACCUMULATION_TILT** — source: openPositions vs completedPositions; normalization: 100 * open / (open + completed); semantics: share of observed positions still held rather than cycled; null: null when open + completed = 0 (no position evidence) — under declared-weight semantics this contributes zero and its weight stays in the denominator.
- Weights: BREADTH 0.35, CYCLE_SCARCITY 0.35, ACCUMULATION_TILT 0.30 (declared-weight semantics from Phase 5G: a null component contributes zero and keeps its weight in the denominator).

## 6. Proposed eligibility

- >= 25 (activity floor, same anchor as Sisyphus); >= 20 (breadth floor); completedPositions + reentryCount <= 2.
- PnL: NOT required — this archetype describes portfolio/trading structure, not investment skill.

## 7. False-positive tests

- **high-frequency diversified trader who buys AND sells often** — does NOT trigger: many completed cycles -> CYCLE_SCARCITY -> 100/(1+cycles) collapses (e.g. 29 cycles -> 3), pulling match far below 50 through a 0.35 declared weight
- **Caesar-style concentrated trader** — does NOT trigger: breadth is the anti-shape: 1-5 tokens -> BREADTH ~0-20; eligibility floor distinctTokens >= 20 fails outright
- **Midas-style profitable holder** — mostly does NOT trigger; overlap acknowledged: Midas evidence requires a >= $100 priced open winner; such wallets usually hold few assets (breadth fails). A wallet holding MANY profitable positions would structurally match the accumulator shape — but that is arguably correct structure-wise; assignment then depends on which persona scores higher, and Midas remains unmeasurable without current prices
- **wallet with 10 random dust tokens** — does NOT trigger: breadth 10 < 20 floor; dust also rarely produces >= 25 qualifying swaps
- **wallet with 200 tokens but only 3 qualifying swaps** — does NOT trigger: qualifyingSwaps 3 < 25 — token holdings without swap activity are not counted at all (features use tradedTokenCount from swaps, never holdings)
- **partial-history wallet where exits cannot be observed** — may trigger — explicitly bounded: breadth and repetition are window-fair ratios, but EXIT_SCARCITY only proves absence WITHIN the window; the >= 25 swap floor reduces (not removes) truncation risk; this is a declared KNOWN LIMITATION
- **airdrop recipient with many tokens but few actual buys** — does NOT trigger: airdrops are TRANSFERs, never qualifying swaps; tradedTokenCount counts only swapped assets, and qualifyingSwaps >= 25 gates the rest

## Formula simulation on the stored 40 (offline, proposal only)

| Wallet | B | in cluster | BREADTH | CYCLE_SCARCITY | ACCUM_TILT | Match | Eligible | Would assign |
|---|---|---|---:|---:|---:|---:|---|---|
| T9 | ✓ | yes | 100 | 100 | 100 | 100 | Y | YES |
| P4 | ✓ | yes | 91.4 | 100 | 100 | 97 | Y | YES |
| L5 |  | no | 84.3 | 100 | 100 | 94.5 | Y | YES |
| L6 |  | no | 84.3 | 100 | 100 | 94.5 | Y | YES |
| M5 | ✓ | yes | 74.4 | 100 | 100 | 91 | Y | YES |
| P9 |  | no | 64.9 | 100 | 100 | 87.7 | N |  |
| P5 |  | no | 62.6 | 100 | 100 | 86.9 | N |  |
| M3 |  | no | 60.1 | 100 | 100 | 86 | N |  |
| L8 |  | no | 53.8 | 100 | 100 | 83.8 | N |  |
| T2 |  | no | 47.6 | 100 | 100 | 81.7 | N |  |
| M10 |  | no | 42.2 | 100 | 100 | 79.8 | N |  |
| M1 |  | no | 38.8 | 100 | 100 | 78.6 | N |  |
| M2 |  | no | 34.9 | 100 | 100 | 77.2 | N |  |
| P7 |  | no | 78.8 | 50 | 95 | 73.6 | Y | YES |
| M8 |  | no | 77.6 | 50 | 95.2 | 73.2 | Y | YES |
| P2 |  | no | 15 | 100 | 100 | 70.3 | N |  |
| L10 |  | no | 69.7 | 50 | 93.3 | 69.9 | Y | YES |
| M4 | ✓ | yes | 86.4 | 100 | null | 65.3 | Y | YES |
| M6 | ✓ | yes | 76.4 | 100 | null | 61.7 | Y | YES |
| P3 |  | no | 74.4 | 25 | 80 | 58.8 | N |  |
| T1 |  | no | 57.2 | 33.3 | 80 | 55.7 | N |  |
| T5 |  | no | 100 | 3.3 | 61.9 | 54.7 | N |  |
| P1 |  | no | 98.4 | 2.5 | 55 | 51.8 | N |  |

Would-assign wallets: **10** — T9, P4, L5, L6, M5, P7, M8, L10, M4, M6.

---

## PERSONA #9 BEHAVIOR DEFINITION

A wallet that systematically spreads many small acquisition-only positions across a broad set of
distinct assets: it keeps adding new assets (or adding to existing ones) instead of cycling — exits,
re-entries, and completed position loops are rare or absent inside the observed window.

## CORE FEATURES

BREADTH (0.35), CYCLE_SCARCITY (0.35), ACCUMULATION_TILT (0.30). See section 5.

## PROPOSED FORMULA

match = (0.35 * logCountScore(distinctTokens, 100) + 0.35 * 100/(1 + completed + reentries)
         + 0.30 * 100 * open/(open + completed)) / 1.00, null components contribute zero (declared weights).

## PROPOSED ELIGIBILITY

qualifyingSwaps >= 25 AND distinctTokens >= 20 AND (completed + reentries) <= 2. No PnL requirement.

## KNOWN LIMITATIONS

1. EXIT_SCARCITY proves absence only within the 1,000-tx window (right-edge truncation).
2. The archetype overlaps the Sisyphus evidence-limited family (stagnation and breadth correlate);
   wallets like P7/M8/L10 match BOTH the accumulator shape and (with better pricing) Sisyphus.
3. ACCUMULATION_TILT is null for wallets with no open AND no completed positions (M4/M6),
   so their match rests on 0.70 of declared weight — intentional under 5G integrity semantics.
4. ADD/BUY/SELL event counts and true HHI concentration were never captured; the model cannot yet
   distinguish 'adds to existing positions' from 'new assets only'.

## EXPECTED PHASE 5C MATCHES

10 wallets would assign at match >= 50 under the proposal: T9, P4, L5, L6, M5, P7, M8, L10, M4, M6.
All 5 Cluster B members assign; the additional wallets are members of the Sisyphus
evidence-limited family (see limitation 2) — a routing question to resolve at implementation review.

No production changes were made.
