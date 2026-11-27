/**
 * Runs `work` over `items`, at most `limit` at a time, and resolves with the results in the items' order.
 * A slot is free again as soon as its call settles, so one slow call holds back one slot, not a whole batch.
 * Rejects with the first error `work` throws; nothing new starts after that (calls already running finish).
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>|R} work
 * @returns {Promise<R[]>}
 */
async function runLimited(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  const runner = async () => {
    while (next < items.length && !failed) {
      const index = next;
      next += 1;
      try {
        results[index] = await work(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, runner));
  return results;
}

module.exports = { runLimited };
