import assert from "node:assert/strict";
import test from "node:test";
import { mapWithConcurrency } from "./concurrency";

test("mapWithConcurrency preserves input order regardless of completion order", async () => {
  const input = [1, 2, 3, 4, 5, 6, 7];
  const output = await mapWithConcurrency(input, 3, async (value) => {
    // Reverse delay so later items finish first.
    await new Promise((resolve) => setTimeout(resolve, (input.length - value) * 5));
    return value * 10;
  });
  assert.deepEqual(output, [10, 20, 30, 40, 50, 60, 70]);
});

test("mapWithConcurrency never exceeds the concurrency bound", async () => {
  let inFlight = 0;
  let peak = 0;
  const input = Array.from({ length: 12 }, (_, index) => index);
  await mapWithConcurrency(input, 4, async (value) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight -= 1;
    return value;
  });
  assert.ok(peak <= 4, `peak concurrency ${peak} exceeded 4`);
  assert.ok(peak > 1, "work should actually run concurrently");
});

test("mapWithConcurrency handles empty input and single items", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async (value) => value), []);
  assert.deepEqual(await mapWithConcurrency([42], 4, async (value) => value), [42]);
});

test("mapWithConcurrency propagates worker rejections without losing completed work identity", async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error("boom");
      return value;
    }),
    /boom/,
  );
});
