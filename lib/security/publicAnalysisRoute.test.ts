import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/api/analyze-wallet/route";
import { __publicAnalysisTestHooks } from "./publicAnalysis";

const VALID_ADDRESS = "11111111111111111111111111111111";

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://wallet.example/api/analyze-wallet", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": `192.0.2.${Math.floor(Math.random() * 200) + 1}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("provider configuration failures return only the safe public error", async () => {
  const original = process.env.HELIUS_API_KEY;
  delete process.env.HELIUS_API_KEY;
  __publicAnalysisTestHooks.resetRateLimits();
  try {
    const response = await POST(request({ address: VALID_ADDRESS }));
    const text = await response.text();
    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(text), {
      code: "PROVIDER_ERROR",
      message: "Wallet analysis is temporarily unavailable.",
    });
    assert.doesNotMatch(text, /HELIUS|API_KEY|stack|\/Users\//i);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (original === undefined) delete process.env.HELIUS_API_KEY;
    else process.env.HELIUS_API_KEY = original;
  }
});

test("cross-origin and extra-field requests are rejected before analysis", async () => {
  __publicAnalysisTestHooks.resetRateLimits();
  const crossOrigin = await POST(request(
    { address: VALID_ADDRESS },
    { origin: "https://evil.example" },
  ));
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.headers.get("access-control-allow-origin"), null);

  const extraField = await POST(request({
    address: VALID_ADDRESS,
    upstream: "https://evil.example",
  }));
  assert.equal(extraField.status, 400);
});
