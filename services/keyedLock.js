const locks = new Map();

async function withKeyLock(key, task) {
  if (typeof task !== 'function') throw new TypeError('Locked task must be a function');
  const lockKey = String(key);
  const previous = locks.get(lockKey) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  locks.set(lockKey, tail);

  try {
    await previous;
    return await task();
  } finally {
    release();
    if (locks.get(lockKey) === tail) locks.delete(lockKey);
  }
}

module.exports = { withKeyLock };
