import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedTransaction } from "./types";
import { buildWalletBehaviorProfile } from "./behaviorFeatures";

const SOL = { mint: "SOL", symbol: "SOL" } as const;
const BONK = { mint: "bonk-mint", symbol: "BONK" } as const;

function swap(
  signature: string,
  timestamp: number,
  outgoing: typeof SOL | typeof BONK,
  outgoingAmount: number,
  outgoingUsd: number | undefined,
  incoming: typeof SOL | typeof BONK,
  incomingAmount: number,
  incomingUsd: number | undefined,
): NormalizedTransaction {
  return {
    signature,
    timestamp,
    type: "SWAP",
    tokenChanges: [
      { ...outgoing, amount: outgoingAmount, direction: "OUT", usdValue: outgoingUsd },
      { ...incoming, amount: incomingAmount, direction: "IN", usdValue: incomingUsd },
    ],
  };
}

test("reconstructs weighted cost, exits, re-entry, and signed progress", () => {
  const transactions = [
    swap("buy", 100, SOL, 1, 100, BONK, 10, 100),
    swap("add", 200, SOL, 2, 200, BONK, 10, 200),
    swap("partial", 300, BONK, 5, 100, SOL, 1, 100),
    swap("exit", 400, BONK, 15, 180, SOL, 1.8, 180),
    swap("reentry", 500, SOL, 0.8, 80, BONK, 4, 80),
  ];

  const result = buildWalletBehaviorProfile(transactions, { historyComplete: true });
  const ledger = result.ledgers[0];

  assert.deepEqual(ledger.events.map((event) => event.eventType), [
    "BUY", "ADD", "PARTIAL_SELL", "EXIT", "RE_ENTRY",
  ]);
  assert.equal(ledger.sells[0].realizedPnlUsd, 25);
  assert.equal(ledger.sells[1].realizedPnlUsd, -45);
  assert.equal(ledger.reentries[0].reenteredHigher, true);
  assert.equal(result.features.realizedPnlUsd.value, -20);
  assert.equal(result.features.realizedPnlUsd.coverage, 1);
  assert.equal(result.features.totalVolumeUsd.value, 660);
  assert.ok(Math.abs((result.features.progressEfficiency.value ?? 0) - (-20 / 660)) < 1e-12);
});

test("does not fabricate opening state, basis, or prices in partial history", () => {
  const transactions: NormalizedTransaction[] = [
    swap("first-sell", 100, BONK, 5, undefined, SOL, 1, undefined),
    { signature: "transfer", timestamp: 200, type: "TRANSFER", tokenChanges: [
      { ...BONK, amount: 10, direction: "IN" },
    ] },
  ];

  const result = buildWalletBehaviorProfile(transactions, { historyComplete: false });
  const ledger = result.ledgers[0];

  assert.equal(ledger.openingStateUnknown, true);
  assert.equal(ledger.realizedPnlUsd.value, null);
  assert.equal(result.features.totalVolumeUsd.value, null);
  assert.equal(result.features.completedPositionCount, 0);
  assert.equal(result.features.progressEfficiency.value, null);
  assert.equal(result.features.qualifyingSwapCount, 1);
});

test("records both sides of token-to-token swaps and ignores non-swaps", () => {
  const WIF = { mint: "wif-mint", symbol: "WIF" } as const;
  const transactions: NormalizedTransaction[] = [
    {
      signature: "token-to-token",
      timestamp: 100,
      type: "SWAP",
      tokenChanges: [
        { ...BONK, amount: 10, direction: "OUT" },
        { ...WIF, amount: 2, direction: "IN" },
      ],
    },
    {
      signature: "not-a-trade",
      timestamp: 200,
      type: "TRANSFER",
      tokenChanges: [{ ...WIF, amount: 2, direction: "OUT" }],
    },
  ];

  const result = buildWalletBehaviorProfile(transactions, { historyComplete: false });
  assert.equal(result.features.tradedTokenCount, 2);
  assert.equal(result.features.buyCount, 1);
  assert.equal(result.features.sellCount, 1);
  assert.equal(result.features.qualifyingSwapCount, 1);
});
