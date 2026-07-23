async function withRetry(fn, options = {}) {
  const { retries = 3, delay = 1000, timeout = 10000 } = options;
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    try {
      const res = await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))
      ]);
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
module.exports = { withRetry };