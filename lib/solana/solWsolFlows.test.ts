import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSolWsolEconomicFlows, WSOL_MINT } from "./solWsolFlows";

const WALLET = "wallet";
const WSOL_ACCOUNT = "wallet-wsol-account";
const TOKEN = "token";

function wrapFixture(nativeSol: number, wsol: number) {
  return normalizeSolWsolEconomicFlows({
    wallet: WALLET,
    balanceChanges: [
      { mint: "SOL", amount: -nativeSol },
      { mint: WSOL_MINT, amount: -wsol },
      { mint: TOKEN, amount: 1_000, decimals: 6 },
    ],
    nativeTransfers: [{
      fromUserAccount: WALLET,
      toUserAccount: WSOL_ACCOUNT,
      amount: wsol * 1_000_000_000,
    }],
    tokenTransfers: [{
      fromUserAccount: WALLET,
      fromTokenAccount: WSOL_ACCOUNT,
      toUserAccount: "pool",
      toTokenAccount: "pool-wsol-account",
      tokenAmount: wsol,
      mint: WSOL_MINT,
    }],
    feeLamports: 365_303,
  });
}

test("A: 5 SOL wrap plus 5 WSOL pool transfer produces one 5 SOL-equivalent input", () => {
  const result = wrapFixture(5.051365303, 5);
  assert.deepEqual(result.balanceChanges.filter((change) => change.mint === "SOL"), []);
  assert.equal(result.balanceChanges.find((change) => change.mint === WSOL_MINT)?.amount, -5);
  assert.equal(result.normalization?.wrappedSolAmount, 5);
  assert.ok(Math.abs((result.normalization?.ancillaryNativeSolOut ?? 0) - 0.051365303) < 1e-12);
  assert.equal(result.normalization?.networkFeeSol, 0.000365303);
});

test("B: 1 SOL wrap plus 1 WSOL pool transfer produces one 1 SOL-equivalent input", () => {
  const result = wrapFixture(1.017293411, 1);
  assert.deepEqual(result.balanceChanges.filter((change) => change.mint === "SOL"), []);
  assert.equal(result.balanceChanges.find((change) => change.mint === WSOL_MINT)?.amount, -1);
});

test("C: WSOL unwrapped to native SOL is represented once on output", () => {
  const result = normalizeSolWsolEconomicFlows({
    wallet: WALLET,
    balanceChanges: [
      { mint: WSOL_MINT, amount: 2 },
      { mint: "SOL", amount: 1.9998 },
      { mint: TOKEN, amount: -1_000 },
    ],
    tokenTransfers: [{
      fromUserAccount: "pool",
      fromTokenAccount: "pool-wsol-account",
      toUserAccount: WALLET,
      toTokenAccount: WSOL_ACCOUNT,
      tokenAmount: 2,
      mint: WSOL_MINT,
    }],
    nativeTransfers: [{
      fromUserAccount: WSOL_ACCOUNT,
      toUserAccount: WALLET,
      amount: 2_000_000_000,
    }],
  });
  assert.deepEqual(result.balanceChanges.filter((change) => change.mint === "SOL"), []);
  assert.equal(result.balanceChanges.find((change) => change.mint === WSOL_MINT)?.amount, 2);
  assert.equal(result.normalization?.unwrappedSolAmount, 2);
});

test("D: independent native SOL and WSOL flows are not deduplicated without wrap evidence", () => {
  const original = [
    { mint: "SOL", amount: -2 },
    { mint: WSOL_MINT, amount: -3 },
    { mint: TOKEN, amount: 1_000 },
  ];
  const result = normalizeSolWsolEconomicFlows({
    wallet: WALLET,
    balanceChanges: original,
    nativeTransfers: [{
      fromUserAccount: WALLET,
      toUserAccount: "native-pool",
      amount: 2_000_000_000,
    }],
    tokenTransfers: [{
      fromUserAccount: WALLET,
      fromTokenAccount: WSOL_ACCOUNT,
      toUserAccount: "wsol-pool",
      tokenAmount: 3,
      mint: WSOL_MINT,
    }],
  });
  assert.deepEqual(result.balanceChanges, original);
  assert.equal(result.normalization, undefined);
});

test("E: ordinary native SOL swap remains unchanged", () => {
  const original = [{ mint: "SOL", amount: -1 }, { mint: TOKEN, amount: 1_000 }];
  assert.deepEqual(normalizeSolWsolEconomicFlows({
    wallet: WALLET,
    balanceChanges: original,
  }).balanceChanges, original);
});

test("F: ordinary WSOL swap without native wrapping remains unchanged", () => {
  const original = [{ mint: WSOL_MINT, amount: -1 }, { mint: TOKEN, amount: 1_000 }];
  assert.deepEqual(normalizeSolWsolEconomicFlows({
    wallet: WALLET,
    balanceChanges: original,
    tokenTransfers: [{
      fromUserAccount: WALLET,
      fromTokenAccount: WSOL_ACCOUNT,
      toUserAccount: "pool",
      tokenAmount: 1,
      mint: WSOL_MINT,
    }],
  }).balanceChanges, original);
});
