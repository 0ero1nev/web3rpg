import assert from "node:assert/strict";
import test from "node:test";
import {
  getTokenHistoricalPricesUsd,
  type TokenHistoricalPriceBudget,
} from "./tokenHistoricalPrice";

test("concurrent token lookups never exceed the shared wallet request budget", async () => {
  const previousKey = process.env.COINGECKO_API_KEY;
  process.env.COINGECKO_API_KEY = "test-key";
  const budget: TokenHistoricalPriceBudget = { externalRequests: 0, maxExternalRequests: 3 };
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response(JSON.stringify({ prices: [[1_700_000_000_000, 1]] }), { status: 200 });
  };

  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) => getTokenHistoricalPricesUsd(
        `unique-budget-mint-${index}`,
        [1_700_000_000 + index * 3_600],
        { budget, fetcher: fetcher as typeof fetch, nowMs: 1_800_000_000_000 },
      )),
    );
    assert.equal(budget.externalRequests, 3);
    assert.equal(calls, 3);
    assert.equal(results.filter((result) => result.stats.requestLimitReached).length, 3);
  } finally {
    if (previousKey === undefined) delete process.env.COINGECKO_API_KEY;
    else process.env.COINGECKO_API_KEY = previousKey;
  }
});

test("unsupported mint stops after one range instead of repeating 404s", async () => {
  const previousKey = process.env.COINGECKO_API_KEY;
  process.env.COINGECKO_API_KEY = "test-key";
  const budget: TokenHistoricalPriceBudget = { externalRequests: 0, maxExternalRequests: 20 };
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response("{}", { status: 404 });
  };

  try {
    const result = await getTokenHistoricalPricesUsd(
      "unique-unsupported-mint",
      [1_600_000_000, 1_700_000_000],
      { budget, fetcher: fetcher as typeof fetch, nowMs: 1_800_000_000_000 },
    );
    assert.equal(calls, 1);
    assert.equal(result.stats.externalRequests, 1);
    assert.equal(result.stats.unsupportedToken, true);
    assert.equal(result.prices.size, 2);
  } finally {
    if (previousKey === undefined) delete process.env.COINGECKO_API_KEY;
    else process.env.COINGECKO_API_KEY = previousKey;
  }
});
