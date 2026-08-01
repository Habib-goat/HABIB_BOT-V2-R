// 429s get their own retry budget since they need to "wait it out" rather
// than genuinely being a failure — the request itself was fine.
const MAX_429_RETRIES = 5;

async function withRetry(fn, options = {}) {
  const { retries = 3, delay = 1000, timeout = 10000 } = options;
  let attempt = 0;
  let rateLimitAttempt = 0;

  while (true) {
    attempt++;
    try {
      const res = await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))
      ]);
      return res;
    } catch (err) {
      const status = err?.response?.status;

      if (status === 429) {
        rateLimitAttempt++;
        if (rateLimitAttempt > MAX_429_RETRIES) throw err;

        // Respect the server's Retry-After header if present (seconds or HTTP-date).
        const header = err.response.headers?.["retry-after"];
        let waitMs;
        if (header) {
          const asSeconds = Number(header);
          waitMs = Number.isFinite(asSeconds)
            ? asSeconds * 1000
            : Math.max(0, new Date(header).getTime() - Date.now());
        }
        // Fallback: exponential backoff (2s, 4s, 8s, 16s, 32s) if no usable header.
        if (!waitMs || waitMs <= 0) waitMs = 2000 * Math.pow(2, rateLimitAttempt - 1);

        await new Promise(r => setTimeout(r, waitMs));
        continue; // doesn't count against the normal `retries` budget
      }

      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
module.exports = { withRetry };
