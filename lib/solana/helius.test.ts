import assert from "node:assert/strict";
import test from "node:test";
import { __heliusTestHooks, HeliusError, fetchHeliusWalletData } from "./helius";

type FetchCall = { url: URL; init?: RequestInit; attemptKey: string };

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function historyPage(signatures: string[], hasMore: boolean, nextCursor?: string) {
  return {
    data: signatures.map((signature, index) => ({
      signature,
      timestamp: 1_000 + index,
      type: null,
      feePayer: "wallet",
      balanceChanges: [{ mint: "So11111111111111111111111111111111111111112", amount: -0.1 }, { mint: "MintA111111111111111111111111111111111111111", amount: 5 }],
    })),
    pagination: hasMore ? { hasMore: true, nextCursor: nextCursor ?? "cursor" } : { hasMore: false },
  };
}

test("parsed transaction batches run concurrently, keep deterministic enrichment output, and never duplicate", async () => {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  let inFlight = 0;
  let peak = 0;
  process.env.HELIUS_API_KEY = "test-key";
  __heliusTestHooks.enableRequestTelemetry();
  __heliusTestHooks.resetRequestTelemetry();
  __heliusTestHooks.resetParsedEnrichmentCache();

  // 2 pages of history (200 null-type signatures) -> 2 parsed batches.
  const sigsPage1 = Array.from({ length: 100 }, (_, index) => `sig-a${index}`);
  const sigsPage2 = Array.from({ length: 100 }, (_, index) => `sig-b${index}`);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ url, init, attemptKey: `${init?.method ?? "GET"} ${url.pathname}` });
    if (url.pathname.endsWith("/balances")) {
      return jsonResponse({ balances: [], pagination: { hasMore: false } });
    }
    if (url.pathname.endsWith("/history")) {
      const before = url.searchParams.get("before");
      return before ? jsonResponse(historyPage(sigsPage2, false)) : jsonResponse(historyPage(sigsPage1, true, "cursor"));
    }
    // parsed-transactions POST
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 15));
    inFlight -= 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as { transactions: string[] };
    const analyzedAddress = "Wallet1111111111111111111111111111111111111111";
    return jsonResponse(body.transactions.map((signature) => ({
      signature,
      type: "SWAP",
      source: "JUPITER",
      events: { swap: { tokenInputs: [], tokenOutputs: [{ userAccount: analyzedAddress, mint: "MintA111111111111111111111111111111111111111", rawTokenAmount: { tokenAmount: "5", decimals: 6 } }] } },
      instructions: [{ programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" }],
    })));
  }) as typeof fetch;

  try {
    const data = await fetchHeliusWalletData("Wallet1111111111111111111111111111111111111111", 200);
    assert.equal(data.transactions.length, 200);
    assert.ok(data.transactions.every((transaction) => transaction.type === "SWAP"), "all enrichments applied");
    assert.equal(peak, 2, "both parsed batches should be in flight together");
    const parsedCalls = calls.filter((call) => call.url.pathname.endsWith("/transactions"));
    assert.equal(parsedCalls.length, 2, "each batch fetched exactly once");
    assert.deepEqual(__heliusTestHooks.getDuplicateRequestIdentities(), [], "no duplicate request identities");

    const repeated = await fetchHeliusWalletData("Wallet1111111111111111111111111111111111111111", 200);
    assert.ok(repeated.transactions.every((transaction) => transaction.type === "SWAP"));
    assert.equal(
      calls.filter((call) => call.url.pathname.endsWith("/transactions")).length,
      2,
      "immutable parsed enrichments are reused on the next analysis",
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.HELIUS_API_KEY;
  }
});

test("429 retries only the failed request and honors Retry-After; successful pages are not refetched", async () => {
  const originalFetch = globalThis.fetch;
  const historyCalls: string[] = [];
  process.env.HELIUS_API_KEY = "test-key";
  let firstHistoryCall = true;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/balances")) {
      return jsonResponse({ balances: [], pagination: { hasMore: false } });
    }
    if (url.pathname.endsWith("/history")) {
      const before = url.searchParams.get("before");
      historyCalls.push(before ?? "first");
      if (!before && firstHistoryCall) {
        firstHistoryCall = false;
        return jsonResponse({ error: "rate limited" }, 429, { "retry-after": "0" });
      }
      return before
        ? jsonResponse(historyPage([`sig-${before}`], false))
        : jsonResponse(historyPage(["sig-first"], true, "cursor"));
    }
    return jsonResponse([]);
  }) as typeof fetch;

  try {
    const data = await fetchHeliusWalletData("Wallet1111111111111111111111111111111111111111", 2);
    assert.equal(data.transactions.length, 2);
    // First page: one 429 attempt + one success; second page: one attempt.
    assert.deepEqual(historyCalls, ["first", "first", "cursor"]);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.HELIUS_API_KEY;
  }
});

test("exhausted rate limit on enrichment aborts with RATE_LIMITED; other enrichment failures keep partial results", async () => {
  const originalFetch = globalThis.fetch;
  process.env.HELIUS_API_KEY = "test-key";
  let parsedMode: "rate" | "malformed" = "rate";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/balances")) return jsonResponse({ balances: [], pagination: { hasMore: false } });
    if (url.pathname.endsWith("/history")) return jsonResponse(historyPage(["sig-1", "sig-2"], false));
    if (parsedMode === "rate") return jsonResponse({ error: "limited" }, 429, { "retry-after": "0" });
    // Malformed: not an array -> enrichment aborts, analysis continues on history.
    return jsonResponse({ not: "an array" });
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchHeliusWalletData("Wallet1111111111111111111111111111111111111111", 2),
      (error: unknown) => error instanceof HeliusError && error.kind === "RATE_LIMITED",
    );
    parsedMode = "malformed";
    const data = await fetchHeliusWalletData("Wallet1111111111111111111111111111111111111111", 2);
    assert.equal(data.transactions.length, 2);
    assert.ok(data.transactions.every((transaction) => transaction.type == null), "history data survives enrichment failure unclassified");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.HELIUS_API_KEY;
  }
});

test("low-activity wallets skip balances only after exact qualifying-swap classification", async () => {
  const originalFetch = globalThis.fetch;
  process.env.HELIUS_API_KEY = "test-key";
  let balanceCalls = 0;
  const quoteMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const solMint = "So11111111111111111111111111111111111111112";

  const transactions = [
    // Labeled transfers stay transfers even when they have both directions.
    ...Array.from({ length: 10 }, (_, index) => ({
      signature: `transfer-${index}`,
      timestamp: 1_000 + index,
      type: "TRANSFER",
      balanceChanges: [
        { mint: solMint, amount: -0.1 },
        { mint: `Mint${index}`, amount: 1 },
      ],
    })),
    // A quote-to-quote swap has no non-quote leg and is not qualifying.
    {
      signature: "quote-only",
      timestamp: 2_000,
      type: "SWAP",
      balanceChanges: [
        { mint: solMint, amount: -0.1 },
        { mint: quoteMint, amount: 10 },
      ],
    },
    // Nine genuine swaps remain below the normal-persona threshold.
    ...Array.from({ length: 9 }, (_, index) => ({
      signature: `swap-${index}`,
      timestamp: 3_000 + index,
      type: "SWAP",
      balanceChanges: [
        { mint: solMint, amount: -0.1 },
        { mint: `Token${index}`, amount: 1 },
      ],
    })),
  ];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/history")) {
      return jsonResponse({ data: transactions, pagination: { hasMore: false } });
    }
    if (url.pathname.endsWith("/balances")) {
      balanceCalls += 1;
      return jsonResponse({ balances: [], pagination: { hasMore: false } });
    }
    return jsonResponse([]);
  }) as typeof fetch;

  try {
    const data = await fetchHeliusWalletData("WalletLowActivity111111111111111111111111111", 100);
    assert.equal(data.balancesSkippedForLowActivity, true);
    assert.equal(balanceCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.HELIUS_API_KEY;
  }
});

test("the tenth qualifying swap preserves the balance fetch", async () => {
  const originalFetch = globalThis.fetch;
  process.env.HELIUS_API_KEY = "test-key";
  let balanceCalls = 0;
  const solMint = "So11111111111111111111111111111111111111112";
  const transactions = Array.from({ length: 10 }, (_, index) => ({
    signature: `swap-${index}`,
    timestamp: 1_000 + index,
    type: "SWAP",
    balanceChanges: [
      { mint: solMint, amount: -0.1 },
      { mint: `Token${index}`, amount: 1 },
    ],
  }));

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/history")) {
      return jsonResponse({ data: transactions, pagination: { hasMore: false } });
    }
    if (url.pathname.endsWith("/balances")) {
      balanceCalls += 1;
      return jsonResponse({ balances: [{ mint: solMint, balance: 1 }], pagination: { hasMore: false } });
    }
    return jsonResponse([]);
  }) as typeof fetch;

  try {
    const data = await fetchHeliusWalletData("WalletThreshold1111111111111111111111111111", 100);
    assert.equal(data.balancesSkippedForLowActivity, undefined);
    assert.equal(balanceCalls, 1);
    assert.equal(data.balances.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.HELIUS_API_KEY;
  }
});
