import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedTransaction } from "./types";
import { valueSwaps } from "./valueSwaps";
import { historicalPriceBucket } from "../pricing/historicalPrice";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("values verified stablecoin execution without a price request", async () => {
  let priceRequests = 0;
  const transaction: NormalizedTransaction = {
    signature: "stable-buy",
    timestamp: 1_700_000_000,
    type: "SWAP",
    tokenChanges: [
      { mint: USDC, symbol: "USDC", amount: 100, direction: "OUT" },
      { mint: "token", symbol: "TOKEN", amount: 50, direction: "IN" },
    ],
  };
  const result = await valueSwaps([transaction], {
    loadSolPrices: async () => {
      priceRequests += 1;
      return new Map();
    },
  });

  assert.equal(priceRequests, 0);
  assert.equal(result.valuations[0].usdValue, 100);
  assert.equal(result.valuations[0].inputPriceUsd, 1);
  assert.equal(result.valuations[0].outputPriceUsd, 2);
  assert.equal(result.valuations[0].source, "STABLECOIN_EXECUTION");
  assert.equal(result.valuations[0].confidence, "HIGH");
});

test("values SOL swaps from the timestamp bucket and derives execution price", async () => {
  const timestamp = 1_700_000_000;
  const transaction: NormalizedTransaction = {
    signature: "sol-buy",
    timestamp,
    type: "SWAP",
    tokenChanges: [
      { mint: "SOL", symbol: "SOL", amount: 2, direction: "OUT" },
      { mint: "token", amount: 100, direction: "IN" },
    ],
  };
  const result = await valueSwaps([transaction], {
    loadSolPrices: async () => new Map([[historicalPriceBucket(timestamp), {
      asset: "SOL",
      bucketTimestamp: historicalPriceBucket(timestamp),
      providerTimestamp: timestamp,
      priceUsd: 150,
    }]]),
  });

  assert.equal(result.valuations[0].usdValue, 300);
  assert.equal(result.valuations[0].inputPriceUsd, 150);
  assert.equal(result.valuations[0].outputPriceUsd, 3);
  assert.equal(result.valuations[0].source, "SOL_HISTORICAL_PRICE");
  assert.equal(result.valuations[0].confidence, "MEDIUM");
});

test("propagates an existing reliable side and leaves unanchored swaps unknown", async () => {
  const transactions: NormalizedTransaction[] = [
    {
      signature: "propagated",
      timestamp: 1_700_000_000,
      type: "SWAP",
      tokenChanges: [
        { mint: "token-a", amount: 10, direction: "OUT", usdValue: 200 },
        { mint: "token-b", amount: 20, direction: "IN" },
      ],
    },
    {
      signature: "unknown",
      timestamp: 1_700_000_100,
      type: "SWAP",
      tokenChanges: [
        { mint: "token-c", amount: 3, direction: "OUT" },
        { mint: "token-d", amount: 4, direction: "IN" },
      ],
    },
    {
      signature: "spoofed-stable-symbol",
      timestamp: 1_700_000_200,
      type: "SWAP",
      tokenChanges: [
        { mint: "not-usdc", symbol: "USDC", amount: 100, direction: "OUT" },
        { mint: "token-e", amount: 10, direction: "IN" },
      ],
    },
  ];
  const result = await valueSwaps(transactions, { loadSolPrices: async () => new Map() });

  assert.equal(result.valuations[0].source, "PROPAGATED_EXECUTION_PRICE");
  assert.equal(result.valuations[0].usdValue, 200);
  assert.equal(result.transactions[0].tokenChanges[1].usdValue, 200);
  assert.equal(result.valuations[1].source, "UNKNOWN");
  assert.equal(result.valuations[1].usdValue, null);
  assert.equal(result.valuations[2].source, "UNKNOWN");
});

test("provider outage remains explicit and does not masquerade as normal zero coverage", async () => {
  const timestamp = 1_780_000_000;
  const transaction: NormalizedTransaction = {
    signature: "sol-provider-outage",
    timestamp,
    type: "SWAP",
    tokenChanges: [
      { mint: "SOL", amount: 1, direction: "OUT" },
      { mint: "token", amount: 100, direction: "IN" },
    ],
  };
  const result = await valueSwaps([transaction], {
    loadSolPrices: async () => ({
      prices: new Map([[historicalPriceBucket(timestamp), null]]),
      diagnostics: {
        status: "UNAVAILABLE",
        requestedTimestampCount: 1,
        resolvedTimestampCount: 0,
        requestedBucketCount: 1,
        resolvedBucketCount: 0,
        coinbaseRequestCount: 1,
        coinbaseFailureCount: 1,
        coingeckoRequestCount: 1,
        coingeckoFailureCount: 1,
      },
    }),
  });

  assert.equal(result.historicalPricing.status, "UNAVAILABLE");
  assert.equal(result.valuations[0].usdValue, null);
  assert.equal(result.valuations[0].source, "UNKNOWN");
});
