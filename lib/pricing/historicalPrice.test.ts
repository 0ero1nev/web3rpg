import assert from "node:assert/strict";
import test from "node:test";
import {
  getHistoricalPricesUsdWithDiagnostics,
  historicalPriceBucket,
} from "./historicalPrice";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pricePayload(url: string | URL, timestamp: number, price: number) {
  return String(url).includes("coinbase")
    ? [[timestamp, 0, 0, 0, price, 0]]
    : { prices: [[timestamp * 1_000, price]] };
}

test("historical pricing reports OK when the primary provider resolves a timestamp", async () => {
  const timestamp = 1_600_000_000;
  const providerTimestamp = historicalPriceBucket(timestamp) + 1_800;
  const result = await getHistoricalPricesUsdWithDiagnostics("SOL", [timestamp], {
    fetchImpl: async (input) => jsonResponse(pricePayload(String(input), providerTimestamp, 150)),
  });

  assert.equal(result.diagnostics.status, "OK");
  assert.equal(result.diagnostics.requestedTimestampCount, 1);
  assert.equal(result.diagnostics.resolvedTimestampCount, 1);
  assert.equal(result.diagnostics.coinbaseRequestCount, 1);
  assert.equal(result.diagnostics.coinbaseFailureCount, 0);
  assert.equal(result.diagnostics.coingeckoRequestCount, 0);
});

test("historical pricing uses a healthy fallback after primary failure", async () => {
  const timestamp = 1_640_000_000;
  const providerTimestamp = historicalPriceBucket(timestamp) + 1_800;
  const result = await getHistoricalPricesUsdWithDiagnostics("SOL", [timestamp], {
    fetchImpl: async (input) => String(input).includes("coinbase")
      ? jsonResponse({}, 503)
      : jsonResponse(pricePayload(String(input), providerTimestamp, 125)),
  });

  assert.equal(result.diagnostics.status, "OK");
  assert.equal(result.diagnostics.resolvedTimestampCount, 1);
  assert.equal(result.diagnostics.coinbaseFailureCount, 1);
  assert.equal(result.diagnostics.coingeckoRequestCount, 1);
  assert.equal(result.diagnostics.coingeckoFailureCount, 0);
});

test("all-provider failure is UNAVAILABLE and never fabricates a price", async () => {
  const timestamp = 1_680_000_000;
  const result = await getHistoricalPricesUsdWithDiagnostics("SOL", [timestamp], {
    fetchImpl: async () => jsonResponse({}, 503),
  });

  assert.equal(result.diagnostics.status, "UNAVAILABLE");
  assert.equal(result.diagnostics.resolvedTimestampCount, 0);
  assert.equal(result.diagnostics.coinbaseFailureCount, 1);
  assert.equal(result.diagnostics.coingeckoFailureCount, 1);
  assert.deepEqual(result.diagnostics.failureCategories, { HTTP_5XX: 2 });
  assert.equal(result.prices.get(historicalPriceBucket(timestamp)), null);
});

test("successful empty provider responses are genuine missing data, not an outage", async () => {
  const timestamp = 1_720_000_000;
  const result = await getHistoricalPricesUsdWithDiagnostics("SOL", [timestamp], {
    fetchImpl: async (input) => jsonResponse(String(input).includes("coinbase") ? [] : { prices: [] }),
  });

  assert.equal(result.diagnostics.status, "OK");
  assert.equal(result.diagnostics.resolvedTimestampCount, 0);
  assert.equal(result.diagnostics.coinbaseFailureCount, 0);
  assert.equal(result.diagnostics.coingeckoFailureCount, 0);
});

test("pricing diagnostics never serialize proxy configuration", async () => {
  const previous = process.env.HTTPS_PROXY;
  process.env.HTTPS_PROXY = "http://secret-proxy.invalid:1234";
  try {
    const result = await getHistoricalPricesUsdWithDiagnostics("SOL", [1_760_000_000], {
      fetchImpl: async () => jsonResponse({}, 503),
    });
    const serialized = JSON.stringify(result.diagnostics);
    assert.equal(serialized.includes("secret-proxy"), false);
    assert.equal(serialized.includes("HTTPS_PROXY"), false);
  } finally {
    if (previous === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = previous;
  }
});
