# Phase 3 historical USD valuation — A/B/C/D validation

Validation used the saved 1,000-transaction normalized windows for the four public fixtures. Stablecoin execution values were derived locally from verified USDC/USDT mints. SOL execution values used hourly-bucketed historical SOL/USD observations; current holding prices were never used.

## Results

| Wallet | Qualifying swaps | Valued swaps | Valuation coverage | Volume coverage | Observed volume | Observed realized PnL | PnL coverage | Observed progress efficiency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 391 | 391 | 100.00% | 100.00% | $53,188.84 | -$2,064.46 | 73.23% (93/127 sells) | -3.88% |
| B | 229 | 229 | 100.00% | 100.00% | $1,441,765.24 | +$24,269.11 | 75.00% (87/116 sells) | +1.68% |
| C | 710 | 709 | 99.86% | 99.86% | $3,582.26 | -$134.58 | 82.02% (219/267 sells) | -3.76% |
| D | 239 | 225 | 94.14% | 94.14% | $43,898.03 | +$248.21 | 23.33% (28/120 sells) | +0.57% |

The realized PnL values are priced-observation subtotals inside partial history windows, not whole-wallet or lifetime PnL. In particular, D's 23.33% PnL coverage is too low for a reliable profitability conclusion.

## Valuation source distribution

Percentages use qualifying swaps as the denominator.

| Wallet | Stablecoin execution | SOL historical | Propagated | Unknown |
|---|---:|---:|---:|---:|
| A | 0.00% (0) | 100.00% (391) | 0.00% (0) | 0.00% (0) |
| B | 99.13% (227) | 0.87% (2) | 0.00% (0) | 0.00% (0) |
| C | 0.00% (0) | 99.86% (709) | 0.00% (0) | 0.14% (1) |
| D | 85.77% (205) | 8.37% (20) | 0.00% (0) | 5.86% (14) |

`PROPAGATED_EXECUTION_PRICE` is supported and regression-tested, but no qualifying A–D swap entered Phase 3 with a reliable non-SOL/non-stablecoin USD-valued side, so its observed count is zero. `EXTERNAL_TOKEN_PRICE` is reserved in the type contract and was not used.

## Valuation rules

- Verified USDC or USDT amount is treated as the execution USD value, with `STABLECOIN_EXECUTION` and `HIGH` confidence. Symbols alone never qualify.
- SOL or WSOL amount is multiplied by the nearest historical SOL/USD point for the transaction's one-hour bucket, with `SOL_HISTORICAL_PRICE` and `MEDIUM` confidence.
- If a token-to-token swap already has one completely and reliably USD-valued side, that execution value is copied to a single opposite leg with `PROPAGATED_EXECUTION_PRICE` and `MEDIUM` confidence.
- Multiple opposite legs are not assigned a fabricated allocation. The swap can retain an anchored total value while unallocatable legs remain unpriced.
- A swap without a verified anchor or reliable pre-valued side remains `UNKNOWN` with null USD value and `LOW` confidence.

## Cache and provider behavior

- Historical SOL timestamps are bucketed to one hour.
- Missing buckets are batched into public Coinbase Exchange `SOL-USD` hourly candle requests of no more than 12 days (within the 300-candle limit). CoinGecko `/coins/solana/market_chart/range` is the fallback provider.
- Positive bucket results are cached server-side for 24 hours; misses are cached for 10 minutes.
- Concurrent requests for the same asset and bucket share an in-flight promise.
- A provider error or missing nearby observation returns null valuation; it does not fabricate a price or fail the base wallet profile.

## Coverage definitions

- Swap valuation coverage: USD-valued qualifying swaps / qualifying swaps.
- Volume coverage: qualifying swaps with a completely valued inbound or outbound side / qualifying swaps.
- PnL coverage: sell legs with both reliable weighted-average basis and disposal USD value / all reconstructed sell legs.
- Progress efficiency: observed signed realized PnL / observed priced volume. Its coverage is the minimum of PnL and volume coverage.

All four wallet histories remain capped at 1,000 transactions, so these results describe only the analyzed windows. No Persona scoring or matching was performed.
