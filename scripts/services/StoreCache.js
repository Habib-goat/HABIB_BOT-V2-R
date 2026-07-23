class StoreCache {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, ttlMs = 300000) {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  clear(key) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}

module.exports = new StoreCache();