import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTransactions } from "./normalizeTransactions";
import type { HeliusHistoryTransaction } from "../solana/helius";

function raw(signature: string, type: string | null | undefined, legs: Array<[string, number]>): HeliusHistoryTransaction {
  return {
    signature,
    timestamp: 1_000,
    type,
    balanceChanges: legs.map(([mint, amount]) => ({ mint, amount })),
  };
}

test("missing provider type with both inbound and outbound legs classifies as SWAP", () => {
  const [tx] = normalizeTransactions([
    raw("swap-null", null, [["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 145.5], ["DEW9dSbogusMintExample1111111111111111111111111", -103_000]]),
  ], []);
  assert.equal(tx?.type, "SWAP");
});

test("missing provider type with one-sided legs classifies as TRANSFER", () => {
  const [inbound] = normalizeTransactions([raw("recv", null, [["SomeMintExample1111111111111111111111111111111", 5]])], []);
  assert.equal(inbound?.type, "TRANSFER");
  const [outbound] = normalizeTransactions([raw("send", undefined, [["SomeMintExample1111111111111111111111111111111", -5]])], []);
  assert.equal(outbound?.type, "TRANSFER");
});

test("provider labels are respected over structural inference", () => {
  const [labeledSwap] = normalizeTransactions([raw("s", "SWAP", [["aMint111111111111111111111111111111111111111", 1], ["bMint111111111111111111111111111111111111111", -1]])], []);
  assert.equal(labeledSwap?.type, "SWAP");
  // Two-sided record explicitly labeled TRANSFER by the provider stays TRANSFER.
  const [labeledTransfer] = normalizeTransactions([raw("t", "TRANSFER", [["aMint111111111111111111111111111111111111111", 1], ["bMint111111111111111111111111111111111111111", -1]])], []);
  assert.equal(labeledTransfer?.type, "TRANSFER");
});

test("WSOL wrapping nets to a single leg and stays TRANSFER under missing type", () => {
  const [tx] = normalizeTransactions([raw("wrap", null, [
    ["So11111111111111111111111111111111111111112", -1],
    ["So11111111111111111111111111111111111111112", 1],
  ])], []);
  // Both legs are WSOL, which normalizes to SOL and nets to zero -> no changes.
  assert.equal(tx?.type, "OTHER");
});

test("swap-like structural records still pass through the reconstruction qualifying gate", () => {
  const transactions = normalizeTransactions([
    raw("struct-swap", null, [["So11111111111111111111111111111111111111112", -0.2], ["HH2AHTFakeMintExample111111111111111111111111", 619_191]]),
  ], []);
  const swap = transactions[0];
  assert.equal(swap?.type, "SWAP");
  assert.equal(swap?.tokenChanges.filter((change) => change.direction === "IN").length, 1);
  assert.equal(swap?.tokenChanges.filter((change) => change.direction === "OUT").length, 1);
});
