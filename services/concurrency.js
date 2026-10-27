async function mapWithConcurrency(items, limit, mapper) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  if (items.length === 0) return [];

  const concurrency = Math.max(1, Math.min(items.length, Number(limit) || 1));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

module.exports = { mapWithConcurrency };
