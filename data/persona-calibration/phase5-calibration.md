# Phase 5 — Persona Calibration Report

Generated: 2026-10-05T16:30:41.464Z (Asia/Shanghai)

First-run, read-only calibration. The eight-Persona system ran UNCHANGED
(no formula, threshold, eligibility rule, parser, valuation, or UI change).

## 1. Dataset

- 44 wallets selected (44 scored, 0 failed)
- Harvested from recent on-chain activity of six mints observed during Phase 2–4 validation, plus the four Phase 2–4 seed wallets (A–D).
- No wallet was chosen to force a Persona to appear; selection is "recent trader of token X" only.
- Bias note: harvesting from recent token activity skews toward currently-active wallets; dormant/dead wallets are underrepresented.

## 2. Winner distribution

| Persona | Wins | Share |
|---|---:|---:|
| Sisyphus | 4 | 9.1% |
| Newton | 2 | 4.5% |
| Caesar | 6 | 13.6% |
| Croesus | 6 | 13.6% |
| Icarus | 0 | 0.0% |
| Midas | 0 | 0.0% |
| Don Quixote | 0 | 0.0% |
| Napoleon | 0 | 0.0% |
| NO_ELIGIBLE_PERSONA | 26 | 59.1% |
| (single-eligible, no runner-up) | 6 | 13.6% |

## 3. Per-Persona calibration

NULL = not measurable. 0 = measured, behavior absent.

| Persona | Measurable | Eligible | Avg Match | Median Match | Avg Conf | Median Conf | NULL | 0 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sisyphus | 100% | 13.6% | 28.68 | 9 | 31.39 | 24 | 0 | 21 |
| Newton | 100% | 13.6% | 26.11 | 7 | 16.89 | 1 | 0 | 21 |
| Caesar | 100% | 27.3% | 28.11 | 29.5 | 33.86 | 10.5 | 0 | 21 |
| Croesus | 100% | 40.9% | 10.16 | 0 | 45.66 | 56.5 | 0 | 27 |
| Icarus | 20.5% | 4.5% | 40.67 | 47 | 20.45 | 0 | 35 | 0 |
| Midas | 75% | 4.5% | 2.82 | 0 | 3.27 | 0 | 11 | 31 |
| Don Quixote | 75% | 0% | 0 | 0 | 0 | 0 | 11 | 33 |
| Napoleon | 15.9% | 4.5% | 15.71 | 0 | 57.27 | 50 | 37 | 5 |

## 4. Winner margin

Margins computable for 12 of 44 wallets (winner + runner-up both required).

| Bucket | Wallets | Share of margin-bearing |
|---|---:|---:|
| 0-4 pts | 1 | 8.3% |
| 5-9 pts | 4 | 33.3% |
| 10-19 pts | 3 | 25.0% |
| 20+ pts | 4 | 33.3% |

## 5. High-score overlaps (both ≥ 70)

- Sisyphus ≥ 70 AND Caesar ≥ 70: **5** wallets (11.4%) — B, D, W12, W16, W35
- Newton ≥ 70 AND Napoleon ≥ 70: **0** wallets (0%)

All persona pairs with at least one ≥70/≥70 overlap:

| Pair | Wallets | % |
|---|---:|---:|
| Sisyphus + Newton | 5 | 11.4% |
| Sisyphus + Caesar | 5 | 11.4% |
| Newton + Caesar | 4 | 9.1% |
| Sisyphus + Croesus | 1 | 2.3% |
| Newton + Croesus | 1 | 2.3% |
| Caesar + Croesus | 1 | 2.3% |

## 6. Icarus price coverage

- Measurable (real historical samples): **9/44** wallets; not measurable (null): **35**; eligible: **2**.
- Episodes considered (entry+final price legs known): 359; historically priced: 26.
- Unsupported mints observed (distinct per wallet, summed): 72.
- Request-budget-limited wallets (20-request cap hit): 2 — C, W34. The cap was NOT raised.
- Eligible wallet W13 [pump-c] BULLISH: peak 150.2%, giveback 75.6% (101 samples, 100% coverage).
- Eligible wallet W34 [pump-b] JCsKWh: peak 265.5%, giveback 86.3% (8 samples, 100% coverage).

## 7. API cost

- Helius requests: **839** (19.1/wallet)
- Historical-price outbound: CoinGecko **91**, Coinbase **42** (3/wallet combined; includes SOL ranges and token ranges)
- Token-history budget requests: 90 (2/wallet, hard limit 20 per wallet)
- Cache hits (token price, mint+bucket): **6**
- Provider failures: **0**; unsupported mints: 72

## 8. Coverage of recorded inputs

- Qualifying swaps per wallet: min 0, median 2, max 710.
- Wallets with observed USD volume: 23/44 (mean volume coverage 0.491).
- Mean PnL coverage: 0.136; mean historical price coverage: 0.118; mean current price coverage: 0.072.

## 9. Outliers (for manual inspection)

### Top 5 Match per Persona
- **Sisyphus**: W16=96(inelig.) [pump-major], W12=92(inelig.) [pump-major], W19=92(inelig.) [pump-b], D=90(inelig.) [seed], B=87 [seed]
- **Newton**: W16=90(inelig.) [pump-major], W12=84(inelig.) [pump-major], B=79(inelig.) [seed], W19=76(inelig.) [pump-b], A=73 [seed]
- **Caesar**: W16=93 [pump-major], W12=87(inelig.) [pump-major], B=84 [seed], W26=84(inelig.) [jup], W35=75 [meta-d]
- **Croesus**: B=73 [seed], W30=45(inelig.) [meta-d], W35=42 [meta-d], W19=37 [pump-b], A=36 [seed]
- **Icarus**: W34=57 [pump-b], W13=55 [pump-c], W17=51(inelig.) [pump-c], C=49(inelig.) [seed], W30=47(inelig.) [meta-d]
- **Midas**: W13=57 [pump-c], W24=36 [pump-b], W01=0(inelig.) [pump-c], W02=0(inelig.) [pump-a], W03=0(inelig.) [pump-b]
- **Don Quixote**: W01=0(inelig.) [pump-c], W02=0(inelig.) [pump-a], W03=0(inelig.) [pump-b], W04=0(inelig.) [meta-d], W05=0(inelig.) [jup]
- **Napoleon**: A=58 [seed], C=52 [seed], D=0(inelig.) [seed], W15=0(inelig.) [jup], W22=0(inelig.) [pump-major]

### Lowest winning Matches
| Wallet | Source | Winner | Match | Margin | Txs |
|---|---|---|---:|---:|---:|
| W20 | meta-d | Croesus | 0 | n/a | 1000 |
| W26 | jup | Croesus | 0 | n/a | 267 |
| W14 | pump-b | Croesus | 1 | n/a | 1000 |
| W17 | pump-c | Croesus | 6 | n/a | 548 |
| W39 | pump-b | Croesus | 14 | n/a | 1000 |
| W12 | pump-major | Croesus | 36 | n/a | 1000 |
| W15 | jup | Newton | 40 | 7 | 170 |
| W24 | pump-b | Caesar | 50 | 14 | 1000 |
| C | seed | Sisyphus | 60 | 6 | 1000 |
| W13 | pump-c | Caesar | 62 | 5 | 1000 |

## Problems observed (no changes made)

Findings are data-driven from this run only; every proposal below is UNIMPLEMENTED and awaits review.

- NO_ELIGIBLE_PERSONA rate is 59.1% (26/44 wallets).
- Croesus average measurable Match is very low (10.16).
- Midas average measurable Match is very low (2.82).
- Don Quixote was never eligible across 44 wallets (measurable on 33).
- Don Quixote average measurable Match is very low (0).

## Proposed changes (NOT implemented)

1. If `NO_ELIGIBLE_PERSONA` is high, review eligibility gates (minimum swap counts, dual-price-side requirements) — not the formulas themselves.
2. If a Persona is never measurable or never eligible on real wallets, audit its evidence requirements for feasibility before touching scoring weights.
3. If low-margin (0–4) assignments dominate, consider reporting a tie/ambiguous state in UI — a presentation change, not a scoring change.
4. If Icarus budget caps block coverage on busy wallets, consider smarter mint prioritization within the same 20-request cap.

None of the above has been applied. Formulas, thresholds, and rules are byte-identical to the Phase 4C state.
