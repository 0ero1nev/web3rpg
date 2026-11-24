import assert from "node:assert/strict";
import test from "node:test";
import type { WalletProfile } from "../analysis/types";
import {
  handleInternalAnalyzeWallet,
  INTERNAL_ANALYZER_CONTRACT_VERSION,
} from "../../app/api/internal/v1/analyze-wallet/route";

const VALID_ADDRESS = "11111111111111111111111111111111";
const TOKEN = "test-only-service-token-with-enough-entropy";

const profile: WalletProfile = {
  address: VALID_ADDRESS,
  transactionCount: 1,
  analyzedTransactionCount: 1,
  holdings: [],
  transactions: [],
  dataQuality: {
    historyComplete: true,
    pricingCoverage: 1,
    confidence: "MEDIUM",
    historicalPricingStatus: "OK",
    degradedReasons: [],
  },
};

function request(body: unknown, token?: string) {
  return new Request("https://wallet.example/api/internal/v1/analyze-wallet", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function withToken<T>(value: string | undefined, work: () => Promise<T>) {
  const original = process.env.ANALYZER_SERVICE_TOKEN;
  if (value === undefined) delete process.env.ANALYZER_SERVICE_TOKEN;
  else process.env.ANALYZER_SERVICE_TOKEN = value;
  try {
    return await work();
  } finally {
    if (original === undefined) delete process.env.ANALYZER_SERVICE_TOKEN;
    else process.env.ANALYZER_SERVICE_TOKEN = original;
  }
}

test("internal analyzer fails closed when its service token is not configured", async () => {
  await withToken(undefined, async () => {
    const response = await handleInternalAnalyzeWallet(
      request({ walletAddress: VALID_ADDRESS, contractVersion: "v1" }, TOKEN),
      async () => profile,
    );
    assert.equal(response.status, 503);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, "SERVICE_MISCONFIGURED");
  });
});

test("internal analyzer rejects missing and invalid bearer credentials before analysis", async () => {
  await withToken(TOKEN, async () => {
    let calls = 0;
    const analyze = async () => { calls += 1; return profile; };

    const missing = await handleInternalAnalyzeWallet(
      request({ walletAddress: VALID_ADDRESS, contractVersion: "v1" }),
      analyze,
    );
    const invalid = await handleInternalAnalyzeWallet(
      request({ walletAddress: VALID_ADDRESS, contractVersion: "v1" }, "wrong-token"),
      analyze,
    );

    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
    assert.equal(calls, 0);
    assert.doesNotMatch(await invalid.text(), /wrong-token|authorization|bearer/i);
  });
});

test("internal analyzer validates v1 requests and returns the actual profile contract", async () => {
  await withToken(TOKEN, async () => {
    const response = await handleInternalAnalyzeWallet(
      request({ walletAddress: VALID_ADDRESS, contractVersion: "v1" }, TOKEN),
      async (address) => ({ ...profile, address }),
    );
    const payload = await response.json() as {
      contractVersion: string;
      profile: WalletProfile;
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(payload.contractVersion, INTERNAL_ANALYZER_CONTRACT_VERSION);
    assert.deepEqual(payload.profile, profile);
  });
});

test("internal analyzer rejects unknown contract versions without calling analysis", async () => {
  await withToken(TOKEN, async () => {
    let called = false;
    const response = await handleInternalAnalyzeWallet(
      request({ walletAddress: VALID_ADDRESS, contractVersion: "v2" }, TOKEN),
      async () => { called = true; return profile; },
    );

    assert.equal(response.status, 400);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, "UNSUPPORTED_CONTRACT_VERSION");
    assert.equal(called, false);
  });
});
