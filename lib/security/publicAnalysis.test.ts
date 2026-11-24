import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  __publicAnalysisTestHooks,
  allowedAnalysisOrigin,
  AnalysisCapacityError,
  checkAnalysisRateLimit,
  isValidSolanaPublicKey,
  PublicRequestError,
  readPublicAnalysisRequest,
  runWithColdAnalysisSlot,
} from "./publicAnalysis";

const VALID_ADDRESS = "11111111111111111111111111111111";
const settingNames = [
  "ANALYSIS_MAX_BODY_BYTES",
  "ANALYSIS_RATE_LIMIT_MAX",
  "ANALYSIS_RATE_LIMIT_WINDOW_MS",
  "ANALYSIS_MAX_COLD_CONCURRENCY",
  "ANALYSIS_MAX_COLD_QUEUE",
  "ANALYSIS_ALLOWED_ORIGINS",
  "ANALYSIS_TRUST_X_FORWARDED_FOR",
  "NODE_ENV",
] as const;
const originalSettings = Object.fromEntries(settingNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of settingNames) {
    const value = originalSettings[name];
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else Reflect.set(process.env, name, value);
  }
  __publicAnalysisTestHooks.resetRateLimits();
  __publicAnalysisTestHooks.resetColdState();
});

function jsonRequest(value: unknown, headers: HeadersInit = {}) {
  return new Request("https://wallet.example/api/analyze-wallet", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

test("Solana public keys require canonical base58 text decoding to exactly 32 bytes", () => {
  assert.equal(isValidSolanaPublicKey(VALID_ADDRESS), true);
  assert.equal(isValidSolanaPublicKey(`${VALID_ADDRESS} `), false);
  assert.equal(isValidSolanaPublicKey("0".repeat(32)), false);
  assert.equal(isValidSolanaPublicKey("1".repeat(31)), false);
  assert.equal(isValidSolanaPublicKey("1".repeat(33)), false);
});

test("request schema is strict and does not coerce progress", async () => {
  assert.deepEqual(await readPublicAnalysisRequest(jsonRequest({ address: VALID_ADDRESS })), {
    address: VALID_ADDRESS,
  });
  await assert.rejects(
    readPublicAnalysisRequest(jsonRequest({ address: VALID_ADDRESS, progress: "true" })),
    (error) => error instanceof PublicRequestError && error.reason === "INVALID_SCHEMA",
  );
  await assert.rejects(
    readPublicAnalysisRequest(jsonRequest({ address: VALID_ADDRESS, endpoint: "https://evil.example" })),
    (error) => error instanceof PublicRequestError && error.reason === "INVALID_SCHEMA",
  );
});

test("request reader rejects unsupported media types and oversized streaming bodies", async () => {
  await assert.rejects(
    readPublicAnalysisRequest(new Request("https://wallet.example/api/analyze-wallet", {
      method: "POST",
      body: JSON.stringify({ address: VALID_ADDRESS }),
    })),
    (error) => error instanceof PublicRequestError && error.status === 415,
  );
  process.env.ANALYSIS_MAX_BODY_BYTES = "128";
  await assert.rejects(
    readPublicAnalysisRequest(jsonRequest({ address: VALID_ADDRESS, padding: "x".repeat(200) })),
    (error) => error instanceof PublicRequestError && error.status === 413,
  );
});

test("origin policy permits same-origin and configured exact origins only", () => {
  assert.equal(allowedAnalysisOrigin(jsonRequest({}, { origin: "https://wallet.example" })), "https://wallet.example");
  assert.equal(allowedAnalysisOrigin(jsonRequest({}, { origin: "https://evil.example" })), false);
  process.env.ANALYSIS_ALLOWED_ORIGINS = "https://embed.example";
  assert.equal(allowedAnalysisOrigin(jsonRequest({}, { origin: "https://embed.example" })), "https://embed.example");
  assert.equal(allowedAnalysisOrigin(jsonRequest({})), null);
});

test("per-IP limiter uses trusted Cloudflare identity and resets by window", () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.ANALYSIS_RATE_LIMIT_MAX = "2";
  process.env.ANALYSIS_RATE_LIMIT_WINDOW_MS = "1000";
  const request = jsonRequest({}, { "cf-connecting-ip": "203.0.113.7" });
  assert.equal(checkAnalysisRateLimit(request, 1_000).allowed, true);
  assert.equal(checkAnalysisRateLimit(request, 1_100).allowed, true);
  assert.equal(checkAnalysisRateLimit(request, 1_200).allowed, false);
  assert.equal(checkAnalysisRateLimit(request, 2_001).allowed, true);
});

test("development requests do not consume or hit the analysis rate limit", () => {
  process.env.ANALYSIS_RATE_LIMIT_MAX = "1";
  process.env.ANALYSIS_RATE_LIMIT_WINDOW_MS = "1000";
  const request = jsonRequest({}, { "cf-connecting-ip": "203.0.113.7" });
  Reflect.set(process.env, "NODE_ENV", "development");
  for (let count = 0; count < 20; count += 1) {
    const decision = checkAnalysisRateLimit(request, 1_000);
    assert.equal(decision.allowed, true);
    assert.equal(decision.retryAfterSeconds, 0);
  }
  Reflect.set(process.env, "NODE_ENV", "production");
  assert.equal(checkAnalysisRateLimit(request, 1_000).allowed, true);
  assert.equal(checkAnalysisRateLimit(request, 1_000).allowed, false);
});

test("cold-analysis limiter bounds active work and the waiting queue", async () => {
  process.env.ANALYSIS_MAX_COLD_CONCURRENCY = "1";
  process.env.ANALYSIS_MAX_COLD_QUEUE = "1";
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = runWithColdAnalysisSlot(async () => { await gate; return 1; });
  const second = runWithColdAnalysisSlot(async () => 2);
  await assert.rejects(runWithColdAnalysisSlot(async () => 3), AnalysisCapacityError);
  assert.deepEqual(__publicAnalysisTestHooks.coldState(), { active: 1, queued: 1 });
  release();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(__publicAnalysisTestHooks.coldState(), { active: 0, queued: 0 });
});
