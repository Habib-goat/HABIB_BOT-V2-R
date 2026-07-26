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

  async listCommands(page = 1, limit = 10, category = null) {
    const cacheKey = `list_${page}_${limit}_${category || "all"}`;
    const cached = StoreCache.get(cacheKey);
    if (cached) return cached;

    try {
  console.log("BASE URL:", this.client.defaults.baseURL);

  const url = "/api/store/list";
  console.log("FULL URL:", this.client.defaults.baseURL + url);

  const params = { page, limit };
  if (category && category !== "all") {
    params.category = category;
  }

  const response = await withRetry(() =>
    this.client.get(url, {
      params
    }),
    { retries: 2, timeout: 8000 }
  );

  console.log("STORE RESPONSE:", JSON.stringify(response.data, null, 2));

  const body = response.data || {};
  const items = body.data || [];
  const meta = body.meta || {};

  const data = {
    commands: items,
    total: meta.total || items.length,
    totalPages: meta.totalPages || 1,
    page: meta.page || page
  };

  StoreCache.set(cacheKey, data, 180000);
  return data;

} catch (err) {
  console.error("STORE ERROR:", err.response?.status, err.response?.data);

  StoreLogger.error("Failed to list commands from Store API", err);

  return {
    commands: [],
    total: 0,
    totalPages: 1,
    error: err.message
  };
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
      const body = response.data || {};
      const items = body.data || [];
      const data = {
        commands: items,
        total: (body.meta && body.meta.total) || items.length
      };
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
      const body = response.data;
      const item = body && body.data ? body.data : null;
      if (item) StoreCache.set(cacheKey, item, 300000);
      return item;
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
      const response = await withRetry(() => this.client.get("/api/store/featured"), { retries: 2, timeout: 8000 });
      const body = response.data;
      const items = (body && body.data) || [];
      StoreCache.set(cacheKey, items, 600000);
      return items;
    } catch (err) {
      StoreLogger.error("Failed to fetch featured commands", err);
      return [];
    }
  }
}

module.exports = new StoreAPI();
