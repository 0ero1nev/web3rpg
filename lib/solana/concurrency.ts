/**
 * Bounded-concurrency mapping. Results are written back into the input's
 * index positions, so the returned array is deterministic and identical to a
 * serial map regardless of completion order. A worker rejection rejects the
 * whole call (Promise.all semantics) — callers decide per-item error policy
 * inside their worker.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const limit = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length || 1));
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}
