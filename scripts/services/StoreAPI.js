const axios = require("axios");
const { withRetry } = require("../utils/retry");
const StoreCache = require("./StoreCache");
const StoreLogger = require("./StoreLogger");

const API_BASE_URL = "https://riyad-store-api.onrender.com";

class StoreAPI {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: { "User-Agent": "RiyadStore-MessengerClient/2.0", "Content-Type": "application/json" }
    });
  }

  async listCommands(page = 1, limit = 10, category = "all") {
    const cacheKey = `list_${page}_${limit}_${category}`;
    const cached = StoreCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await withRetry(() => 
        this.client.get("/api/store/list", { params: { page, limit, category } }),
        { retries: 2, timeout: 8000 }
      );
      const data = response.data || { commands: [], total: 0, totalPages: 1 };
      StoreCache.set(cacheKey, data, 180000);
      return data;
    } catch (err) {
      StoreLogger.error("Failed to list commands from Store API", err);
      return { commands: [], total: 0, totalPages: 1, error: err.message };
    }
  }

  async searchCommands(query) {
    if (!query) return { commands: [], total: 0 };
    const cacheKey = `search_${query.toLowerCase().trim()}`;
    const cached = StoreCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await withRetry(() =>
        this.client.get("/api/store/search", { params: { q: query } }),
        { retries: 2, timeout: 8000 }
      );
      const data = response.data || { commands: [] };
      StoreCache.set(cacheKey, data, 120000);
      return data;
    } catch (err) {
      StoreLogger.error(`Failed search for query: ${query}`, err);
      return { commands: [], error: err.message };
    }
  }

  async getCommandDetails(id) {
    const cacheKey = `info_${id}`;
    const cached = StoreCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await withRetry(() =>
        this.client.get(`/api/store/info/${encodeURIComponent(id)}`),
        { retries: 2, timeout: 8000 }
      );
      const data = response.data;
      if (data) StoreCache.set(cacheKey, data, 300000);
      return data;
    } catch (err) {
      StoreLogger.error(`Failed to fetch command details for ID: ${id}`, err);
      return null;
    }
  }

  async downloadCommandRaw(id) {
    try {
      const response = await withRetry(() =>
        this.client.get(`/api/store/raw/${encodeURIComponent(id)}`, { responseType: "text" }),
        { retries: 3, timeout: 10000 }
      );
      return response.data;
    } catch (err) {
      StoreLogger.error(`Failed raw download for command ID: ${id}`, err);
      throw err;
    }
  }

  async uploadCommand(payload) {
    try {
      const response = await withRetry(() =>
        this.client.post("/api/store/upload", payload),
        { retries: 2, timeout: 12000 }
      );
      StoreCache.clear();
      return response.data;
    } catch (err) {
      StoreLogger.error("Failed to upload command to store API", err);
      throw err;
    }
  }

  async getFeatured() {
    const cacheKey = "featured_list";
    const cached = StoreCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await withRetry(() => this.client.get("/store/featured"), { retries: 2, timeout: 8000 });
      const data = response.data || [];
      StoreCache.set(cacheKey, data, 600000);
      return data;
    } catch (err) {
      StoreLogger.error("Failed to fetch featured commands", err);
      return [];
    }
  }
}

module.exports = new StoreAPI();
