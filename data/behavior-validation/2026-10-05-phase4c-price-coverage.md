# Phase 4C — Real Cold-Cache Price Coverage Validation

Generated: 2026-10-05 (Asia/Shanghai)

## Result

The full real-provider chain ran end to end for wallets A–D with a configured
`COINGECKO_API_KEY` (Demo plan, `x-cg-demo-api-key`; official `/api/v3/ping`
probe returned HTTP 200 before the run):

`mint -> CoinGecko contract range -> cached hourly buckets -> observed peak -> peakReturnPct -> givebackPct -> Icarus`

39 external token-price requests were made in total. **Zero provider
failures** — every request returned a definitive HTTP result (200 with prices
or 404/empty-unsupported). Nothing was counted as coverage from a failed,
timed-out, or retried-out request. No current price was ever substituted for a
historical sample.

Icarus is now **measured** (numeric match, real historical samples) for A, C,
and D, and **unmeasurable** (`match: null`) only for B, which has no
historically eligible episode at all. No wallet in A–D exhibits an *eligible*
Icarus episode (peak return ≥ +100% and giveback ≥ 0.5); C's strongest real
candidate missed the giveback threshold by 0.42 percentage points. That is
"behavior not found", not "cannot measure".

Midas and Don Quixote remain unmeasurable on all four wallets because no open
candidate has both a reliable entry and a current value in this run.

## Method

- Server-side validation CLI (`scripts/validate-phase4c.ts`) drives the
  production modules (`Helius -> normalize -> valueSwaps -> behavior ->
  PositionPerformance -> priceCoverageValidation -> scorePersonas`) under
  Node.js 24 with the desktop proxy (127.0.0.1:7890). The workerd dev preview
  cannot reach CoinGecko/Coinbase outbound, so page-driven attempts were
  discarded; the CLI reuses the identical server code.
- Fresh process, so in-process price caches started cold. A, B, C, D ran
  sequentially **in one process** for cross-wallet cache observation.
- Network hardening added before this run: 10 s per-request timeout on all
  historical SOL/token fetches, 250 ms provider spacing, one retry on
  `PROVIDER_FAILURE` (none occurred). The per-wallet 20-request budget and all
  scoring/pricing rules are unchanged.
- Raw per-wallet JSON is preserved in
  `data/behavior-validation/2026-10-05-phase4c-cold-run.jsonl`.
- All four wallets again reached the 1,000-transaction history cap
  (`historyComplete: false`).

## Historical price coverage (real provider)

| Wallet | Eligible episodes | Priced episodes | Coverage | Buckets | External requests | Cache hits | Provider failures | Unsupported mints | Budget reached |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| A | 50 | 1 | 2.0% | 87 | 18 | 0 | 0 | 16 | no |
| B | 0 | 0 | N/A | 0 | 0 | 0 | 0 | 0 | no |
| C | 179 | 5 | 2.8% | 163 | 20 | 0 | 0 | 17 | **yes** |
| D | 12 | 10 | 83.3% | 88 | 1 | 0 | 0 | 0 | no |

- A and C sample mostly long-tail pump/meta mints that CoinGecko's
  `solana/contract` endpoint does not carry; those are recorded as
  `UNSUPPORTED_TOKEN`, never as failures or as coverage.
- C exhausted the 20-request budget while sampling its 24 candidate episodes,
  so its 2.8% coverage is budget-capped rather than provider-rejected.
- D's eligible episodes concentrate on one supported mint (`BANKJmvh…meta`);
  a single range request priced 10 of 12 episodes (83.3%).
- B produces no episode with both an entry and a final price leg, so nothing
  was eligible to sample.

## Cross-wallet cache verification

- Token price cache (`mint + hourly bucket`): 0 cross-wallet hits — the
  sampled candidate mints of A–D are pairwise disjoint, so there was nothing
  to reuse. The mechanism simply was not exercised by wallet overlap.
- SOL hourly cache: verified in a separate instrumented one-off run by
  counting outbound fetches around `getHistoricalPricesUsd` (no production
  code modified). A second wallet sharing 2 of 3 hourly buckets with a first
  wallet issued **0** additional outbound requests for the overlap and 1
  request for its new bucket; all 3 buckets resolved. Overlapping buckets are
  served from the in-process cache within TTL.

## Icarus candidates (real historical samples)

`givebackPct` is the ratio `(peak − final) / (peak − entry)`; values above 1
mean the episode finished below its entry price.

### A — 1 candidate, measured not found (match 45, ineligible)

| Mint | Entry | Peak | Final | Peak return | Giveback | Samples | Coverage |
|---|---:|---:|---:|---:|---:|---:|---:|
| `98kfF7…pump` | $0.012547 | $0.012739 | $0.010228 | +1.53% | 13.11 | 11 | 100% |

The peak never approached the +100% threshold; the episode also closed 18.5%
below entry. Icarus is measured and not found.

### C — 3 candidates, measured not found (match 49, ineligible)

| Mint | Entry | Peak | Final | Peak return | Giveback | Samples | Coverage |
|---|---:|---:|---:|---:|---:|---:|---:|
| `6ehEcTMCc85…pump` | $0.002163 | $0.007074 | $0.004639 | +226.99% | 0.4958 | 8 | 100% |
| `FmbmhYpjBzs…pump` | $0.000165 | $0.000198 | $0.000153 | +20.06% | 1.363 | 13 | 100% |
| `7HgfXftRBBq…pump` | $0.005548 | $0.006046 | $0.005347 | +8.97% | 1.403 | 8 | 100% |

The first candidate is a genuine near-miss: a real +227% peak with 49.58%
giveback against the ≥ 50% rule. The other two round-tripped below entry
without a qualifying peak.

### D — 3 candidates, measured not found (match 32, ineligible)

All three are episodes of the same supported mint (`BANKJmvhT8ti…meta`):

| Entry | Peak | Final | Peak return | Giveback | Samples |
|---:|---:|---:|---:|---:|---:|
| $3.8142 | $4.0720 | $3.8839 | +6.8% | 0.730 | 4 |
| $3.8231 | $4.1322 | $3.9587 | +8.1% | 0.561 | 10 |
| $5.0187 | $5.3660 | $5.1836 | +6.9% | 0.525 | 25 |

Peaks stay far below +100%; measured and not found.

### B — 0 candidates, unmeasurable (`match: null`)

## Midas candidates (real, current)

No open position satisfies the Midas rule (profitable, current value ≥ $100,
held ≥ 7 days, both sides known), and every top candidate is missing at least
one price side, so Midas returns `match: null` for A–D.

| Wallet | Strongest candidates (entry → current) | Blocker |
|---|---|---|
| A | `PreweJYE…` "OPENAI" — current $39.27; `BXrbjR…` entry $352.11; `B4cqDd…` entry $524.61 | unknown basis / below $100; PARTIAL_HISTORY ×2 |
| B | `pumpCmX…` "PUMP" — current $4,511.84; `6GmAFS…` entry $725,609.69 | unknown basis; PARTIAL_HISTORY |
| C | `BnXWvs…`/`BXnUS5…`/`34q2Km…` entries $4–$9, held ≈169 d | PARTIAL_HISTORY ×3 |
| D | `Cudisf…` entry $4.00 (374 d); `2zMMhc…` entry $72.56 | PARTIAL_HISTORY; unknown basis |

## Don Quixote candidates

The strongest candidates are the same underlying positions. None has a
measurable severe-loss-plus-30-day profile (returns are null wherever a price
side is missing), so Don Quixote returns `match: null` for A–D.

## Open-position current-price coverage

| Wallet | Open | Reliable cost basis | Current price | Coverage | Unknown basis | Partial history | No provider price |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 13 | 11 | 1 | 7.7% | 2 | 11 | 0 |
| B | 5 | 2 | 1 | 20.0% | 3 | 2 | 0 |
| C | 42 | 41 | 0 | 0% | 1 | 40 | 1 |
| D | 4 | 2 | 0 | 0% | 2 | 2 | 0 |

Partial history remains the dominant blocker: a capped 1,000-transaction
window cannot prove current ownership for swap-reconstructed open episodes.
Live drift vs the earlier keyless run is visible — e.g. A no longer shows the
previously priced Instinct episode and now holds an OPENAI-denominated token;
holdings are as-of this run.

## Eight-persona rerun

`—` is `match: null` (cannot measure). `†` is a numeric but ineligible match.

| Wallet | Sisyphus | Newton | Caesar | Croesus | Icarus | Midas | Don Quixote | Napoleon | Winner | Confidence |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| A | 63 | 73 | 43 | 36 | 45† | — | — | 58 | Newton | 90 |
| B | 87 | 79† (conf 9) | 84 | 73 | — | — | — | — (conf 50) | Sisyphus | 83 |
| C | 60 | 54 | 34 | 8 | 49† | — | — | 52 | Sisyphus | 85 |
| D | 90† | 59 | 74 | 35 | 32† | — | — | 0† | Caesar | 87 |

Notable: B's Newton score of 79 carries confidence 9 (thin re-entry
evidence), and D's Sisyphus 90 is numeric but ineligible. No persona formula
or threshold changed in this run.

## Cost

| Wallet | Real cold-cache requests | Hard limit | Elapsed |
|---|---:|---:|---:|
| A | 18 | 20 | 32.7 s |
| B | 0 | 20 | 28.1 s |
| C | 20 (budget reached) | 20 | 36.9 s |
| D | 1 | 20 | 25.8 s |

Actual mean: 9.75 requests per wallet — identical to the pre-run estimate.
Range requests are batched by mint and cached by `mint + hourly bucket`; the
20-request hard limit held everywhere it was reached.

## What remains open

- No A–D wallet exhibits an *eligible* Icarus episode yet; C's +227%-peak
  candidate missed giveback ≥ 50% by 0.42 pp. Finding a qualifying wallet is
  a behavior-search problem, not a measurement gap.
- B has zero historically eligible episodes, so Icarus/Midas/Don Quixote stay
  `null` for it.
- Page-driven (workerd) validation remains blocked by the desktop proxy and
  is out of scope here; the Node CLI path is the validated surface.
