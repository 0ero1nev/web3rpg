# Phase 7A — Realized-PnL Coverage Attribution

Generated: 2026-10-06T13:21:13.003Z (Asia/Shanghai)

Diagnostic only. Pipeline re-run unchanged to trace every disposal leg of the seven Sisyphus
evidence-limited wallets. No scoring, eligibility, valuation, or threshold changes.

Key code fact: `valueSwaps` never uses external token prices — realized PnL rests on execution
anchors only (stablecoin / historical SOL / propagated side). The CoinGecko token-price budget
affects Icarus peak sampling, NOT realized PnL. Reasons D/E are therefore near-vacuous here.

## 1–2. Per-wallet waterfall and failure attribution

| Wallet | Disposal legs | USD proceeds | Cost basis / PnL | Coverage | A value-unknown | B basis-unknown | C pre-window | D SOL-gap | F overdraw |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P8 | 113 | 64 | 4 | 0.035 | 49 | 7 | 0 | 0 | 53 |
| L10 | 36 | 36 | 13 | 0.361 | 0 | 0 | 5 | 0 | 18 |
| M8 | 38 | 8 | 3 | 0.079 | 30 | 1 | 4 | 0 | 0 |
| P5 | 18 | 18 | 2 | 0.111 | 0 | 0 | 14 | 0 | 2 |
| P9 | 12 | 9 | 1 | 0.083 | 3 | 0 | 7 | 0 | 1 |
| P7 | 31 | 24 | 3 | 0.097 | 7 | 0 | 0 | 0 | 21 |
| L7 | 11 | 11 | 1 | 0.091 | 0 | 0 | 8 | 0 | 2 |

Aggregate over all seven wallets: F_OVERDRAW_AMBIGUITY=97, A_DISPOSAL_VALUE_UNKNOWN=89, C_PARTIAL_HISTORY_INVENTORY=38, B_COST_BASIS_UNKNOWN=8, VALUED=27, total legs 259.

## 3. Execution valuation vs market pricing

| Wallet | missing legs w/ valued counter (execution-derivable) | missing requiring external token price | fundamentally unrecoverable (pre-window / overdraw) |
|---|---:|---:|---:|
| P8 | 0 | 56 | 53 |
| L10 | 0 | 0 | 23 |
| M8 | 0 | 31 | 4 |
| P5 | 0 | 0 | 16 |
| P9 | 0 | 3 | 8 |
| P7 | 0 | 7 | 21 |
| L7 | 0 | 0 | 10 |

A-legs are token<->token swaps with no USD anchor on either side; their counter-assets are
also unvalued tokens, so execution data alone cannot price them — external (or route-aware)
pricing is the legitimate lever. C-legs sold inventory acquired before the window: no execution
or market price can reconstruct a missing acquisition.

## 4. Token / route breakdown (top missing)

- **P8** — by counter: SOL 47/51 missing, TOKEN 49/49 missing, STABLE 13/13 missing; by source: JUPITER 109/113; top missing mints: MEFNBX… 31/31, Dz9mQ9… 25/25, JUPyiw… 12/12, Df6yfr… 10/10, KENJSU… 10/10
- **L10** — by counter: SOL 23/36 missing; by source: JUPITER 23/36; top missing mints: PFER6E… 8/8, pumpCm… 6/6, CARDSc… 2/2, GcHEn2… 2/2, CscZaq… 1/2
- **M8** — by counter: SOL 4/7 missing, TOKEN 30/30 missing, STABLE 1/1 missing; by source: JUPITER 35/38; top missing mints: 4k3Dyj… 2/2, AvZZF1… 2/2, AavE1k… 2/2, DLGRpm… 2/2, orcaEK… 2/2
- **P5** — by counter: SOL 16/18 missing; by source: METEORA 12/14, RAYDIUM 4/4; top missing mints: PEPEqn… 5/5, pumpCm… 4/4, 5tCju6… 3/3, 9fJAWK… 2/2, 46doJP… 1/1
- **P9** — by counter: TOKEN 3/3 missing, SOL 8/9 missing; by source: JUPITER 10/11, RAYDIUM 1/1; top missing mints: J3NKxx… 4/4, 2JcXac… 1/2, BYZ9Cc… 1/1, 5LJMJy… 1/1, 4nrFB5… 1/1
- **P7** — by counter: TOKEN 7/7 missing, SOL 20/23 missing, STABLE 1/1 missing; by source: JUPITER 28/31; top missing mints: 8doS8n… 5/5, FDaJxB… 2/2, Hon2rH… 2/2, 3uLUj3… 2/2, CmgJ1P… 2/2
- **L7** — by counter: SOL 10/11 missing; by source: JUPITER 6/7, RAYDIUM 4/4; top missing mints: 8BtoTh… 3/3, 89q6aH… 3/3, 8HxW9Z… 2/2, 63bpnC… 1/1, FVdo7C… 1/1

## 5. pnlCoverage definition audit

- Denominator: sellCount — EVERY disposal leg (PARTIAL_SELL + EXIT), including legs on ledgers whose inventory predates the window.
- Formula: realizedPnlUsd.coverage = pricedSellCount / sellCount.
- Flag: LEG-COUNT based, not economically weighted: 100 dust legs unvalued + 1 huge valued exit reads as ~1% coverage even when most observed dollars are priced
- Flag: the denominator includes structurally unpriceable legs (pre-window inventory first-sells), so coverage has a hard ceiling below 1 for any wallet distributing pre-window inventory
- Flag: it measures leg observability, not 'how much of the wallet's realized economic outcome is observable'
- Verdict: MISMATCH FLAGGED (definition unchanged): for the target wallets the metric understates achievable observability and mixes structural (partial-history) with economic (pricing) loss

## 6. Recoverability simulation (offline)

| Wallet | Coverage now | Max execution-only | Max external pricing | Max external + conservative basis | Unrecoverable legs |
|---|---:|---:|---:|---:|---:|
| P8 | 0.035 | 0.035 | 0.531 | 1 | 53 |
| L10 | 0.361 | 0.361 | 0.361 | 0.861 | 23 |
| M8 | 0.079 | 0.079 | 0.895 | 0.895 | 4 |
| P5 | 0.111 | 0.111 | 0.111 | 0.222 | 16 |
| P9 | 0.083 | 0.083 | 0.333 | 0.417 | 8 |
| P7 | 0.097 | 0.097 | 0.323 | 1 | 21 |
| L7 | 0.091 | 0.091 | 0.091 | 0.273 | 10 |

Budget increase adds nothing (no PnL leg consumes the token-price budget).

## 7. Sisyphus impact

| Wallet | Sisyphus match (elig) | stored cov | crosses 0.5 w/ external pricing? | w/ full program? | dominant blocker |
|---|---|---:|---|---|---|
| P8 | 86 (N) | 0.035398230088495575 | YES | YES | PRICING |
| L10 | 61 (N) | 0.3235294117647059 | no | YES | PARTIAL_HISTORY |
| M8 | 59 (N) | 0.07894736842105263 | YES | YES | PRICING |
| P5 | 54 (N) | 0.047619047619047616 | no | no | PARTIAL_HISTORY |
| P9 | 54 (N) | 0.08333333333333333 | no | no | PARTIAL_HISTORY |
| P7 | 52 (N) | 0.0967741935483871 | no | YES | PARTIAL_HISTORY |
| L7 | 57 (N) | 0.3 | no | no | PARTIAL_HISTORY |

---

## PRIMARY COVERAGE BOTTLENECK

**F_OVERDRAW_AMBIGUITY** (97 of 259 legs across the seven wallets).

## SECONDARY BOTTLENECK

**A_DISPOSAL_VALUE_UNKNOWN** (89 legs).

## RECOVERABLE COVERAGE

External token pricing of disposal legs and in-window acquisitions would lift coverage to: P8→0.531, L10→0.361, M8→0.895, P5→0.111, P9→0.333, P7→0.323, L7→0.091. Execution-only recovery moves almost nothing (see table).

## UNRECOVERABLE COVERAGE

Pre-window inventory / overdraw legs: P8=53, L10=23, M8=4, P5=16, P9=8, P7=21, L7=10 — structurally outside any pricing fix.

## SISYPHUS WALLETS POTENTIALLY RECOVERABLE

External token pricing alone: P8, M8 cross the 0.50 gate.
Full program (external pricing + conservative tracked-portion basis for overdrawn ledgers): **P8, L10, M8, P7** cross. P5 / P9 / L7 remain blocked by pre-window inventory (C).

## RECOMMENDED NEXT ENGINEERING STEP

1. Conservative cost-basis reconstruction for overdrawn ledgers (97 F-legs, the LARGEST single loss):
   price the TRACKED portion of disposals against in-window acquisition basis instead of discarding
   the whole ledger's PnL — bounded, no fabrication (the untracked excess stays unpriced);
2. Introduce an external token-execution valuation path for token<->token swaps (mint-level
   historical price at execution timestamp, HIGH-scrutiny confidence) — recovers A+B legs;
3. Consider a volume-weighted PnL-coverage metric and a denominator excluding pre-window
   inventory legs (measurement fix, eligibility unchanged for now);
4. Do NOT spend budget on request-limit increases — realized PnL never consumes that budget.

Risk note: external mint-level pricing reintroduces fabrication risk on illiquid long-tail
mints; gate it by liquidity/price-source quality before trusting it for eligibility.
