# Phase 4B — Remaining Persona Evidence

Generated: 2026-10-05 (Asia/Shanghai)

## Outcome

The deterministic lifecycle and sequence evidence for Icarus, Midas,
Don Quixote, and Napoleon is implemented. The four Phase 4A formulas were not
changed. Missing market prices remain `null` and make the dependent Persona
ineligible.

The validation environment did not have a usable `COINGECKO_API_KEY`, so no
token historical-price requests were made. This is intentional: current
holding prices were used only for open-position current value and were never
substituted for historical entry, exit, or peak prices.

## A–D ranking

`†` means the Match is shown but the Persona is ineligible. Winner selection
uses the highest Match among eligible Personas only.

| Wallet | Sisyphus | Newton | Caesar | Croesus | Icarus | Midas | Don Quixote | Napoleon | Winner | Confidence |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| A | 63 | 73 | 43 | 36 | 0† | 0† | 0† | 0† | Newton | 90 |
| B | 87 | 79† | 84 | 73 | 0† | 0† | 0† | 0† | Sisyphus | 83 |
| C | 60 | 54 | 34 | 8 | 0† | 0† | 0† | 52 | Sisyphus | 85 |
| D | 90† | 59 | 74 | 35 | 0† | 0† | 0† | 0† | Caesar | 87 |

All wallets reached the 1,000-transaction analysis limit, so history remained
partial and confidence for history-sensitive evidence was reduced where the
existing Phase 4A rules require it.

## Strongest new-Persona evidence

### Wallet A

- Icarus: ineligible — no covered token peak series; no rise-before-fall episode
  can be asserted.
- Midas: ineligible — no open position simultaneously met meaningful current
  value, positive unrealized return, and the seven-day minimum hold.
- Don Quixote: ineligible — no open position simultaneously met a return of
  `<= -50%` and the 30-day persistence minimum.
- Napoleon: ineligible — separate observations included a 3-episode winning
  streak, maximum 3.38x size expansion, and a -72.7% later loss, but those facts
  did not occur in the same qualifying sequence. They are not combined into a
  false match.

### Wallet B

- Icarus: ineligible — historical peak coverage unavailable.
- Midas and Don Quixote: ineligible — the five reconstructed open episodes did
  not have both reliable entry and current prices.
- Napoleon: ineligible — zero priced completed episodes, so there is no prior
  success sequence or subsequent expanded loss.

### Wallet C

- Napoleon: **eligible, 52 Match / 100 Confidence**.
- Strongest qualifying sequence: 2 consecutive profitable completed episodes,
  followed (after the profits were realized) by a 1.55x position-size expansion
  and a -72.1% realized return.
- Two overextension events met all three requirements in the same sequence.
- Sisyphus remains the winner at 60 Match / 85 Confidence because winner
  selection is still the highest eligible Match and the Phase 4A formulas were
  not retuned.
- Icarus: ineligible — historical peak coverage unavailable.
- Midas and Don Quixote: ineligible — no open position had sufficient reliable
  entry/current evidence plus the required return and duration.

### Wallet D

- Napoleon: ineligible — a 12-episode winning streak exists, but there was no
  subsequent `>= 1.5x` expanded position followed by a `<= -20%` loss.
- Icarus: ineligible — historical peak coverage unavailable.
- Midas and Don Quixote: ineligible — no qualifying long-lived open winner or
  loser with both entry and current price evidence.

## Deterministic rules added

- Position entry and exit prices are weighted execution prices derived only
  when every relevant leg is USD-valued.
- Current price is derived only from the matching current holding's USD value;
  it is never used as a historical price.
- Peak samples: hourly below 24h, every 4h for 1–7d, and daily beyond 7d.
- Peak is accepted only with at least 75% bucket coverage and at least 3
  observed samples. Otherwise peak fields remain `null`.
- Icarus eligibility requires at least +100% peak return, at least 50% giveback,
  and adequate peak coverage in the same episode.
- Midas eligibility requires an open position worth at least $100, positive
  unrealized return, and at least seven days held.
- Don Quixote eligibility requires an open position at or below -50% unrealized
  return and at least 30 days held.
- Napoleon eligibility requires at least two consecutive profitable completed
  episodes, at least 1.5x subsequent position size, and a subsequent loss of at
  least 20%, all in the same sequence. The expanded position must open after
  the preceding profits were realized; overlapping positions do not qualify.

## Historical-price cost report

Only the top 24 economically meaningful/open episodes are considered for peak
sampling. Execution and current performance are still calculated for every
reliable episode, so the sampling cap cannot truncate Napoleon sequences.

| Wallet | Positions available | Peak-priced positions considered | Buckets requested | Cache hit rate | External requests | Cold-cache estimate | Unpriced positions |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 63 | 24 | 311 | 0% | 0 | 20 | 63 |
| B | 5 | 5 | 124 | 0% | 0 | 5 | 5 |
| C | 222 | 24 | 3,069 | 0% | 0 | 20 | 222 |
| D | 18 | 18 | 791 | 0% | 0 | 8 | 18 |

The apparent bucket count does not equal API calls. Buckets for the same mint
are fetched as range requests (up to 365 days per range), then cached by
`mint + hourly bucket`. The hard limit is 20 external historical-token-price
requests per wallet. Across A–D, the estimated cold-cache requirement is 5–20
requests per wallet (mean 13.25), never thousands. Warm-cache requests can be
lower.

Because the provider was unavailable in this run, the observed cache hit rate
is 0% and all peak-priced positions remain unpriced. No result was weakened or
backfilled to compensate.

## Known limitations

- Historical token peak evidence depends on CoinGecko listing/contract
  coverage and a configured server-side API key.
- The peak is a sample-based estimate, not a professional candle high.
- Current holding USD data may not cover illiquid or unlisted tokens; Midas and
  Don Quixote therefore remain ineligible more often than execution-only
  Personas.
- Partial 1,000-transaction history can omit older position openings and whole-
  wallet sequence context. The position state machine continues to reject
  unknown opening inventory.
- Position-size sequence analysis uses reliably valued completed episodes only.

## Verification

- TypeScript: passed (`tsc --noEmit`).
- Focused lint for all Phase 4B files: passed.
- Unit tests: 13 passed, including lifecycle peak/giveback, current-vs-historical
  separation, and Napoleon sequence gating.
- Production build: passed.
- Full-repository lint still reports two pre-existing React effect errors in
  `components/BoosterPack.tsx` and `components/WalletRpg.tsx`; Phase 4B did not
  modify pack opening or card UI.
