"use strict";

const axios = require("axios");

const BASE_URL = (process.env.RIYAD_VIDEO_API_URL || "https://riyad-video-api.onrender.com").replace(/\/+$/, "");
const SEARCH_TTL = 5 * 60 * 1000;
const DOWNLOAD_TTL = 90 * 1000;
const cache = new Map();
const inflight = new Map();

function cached(key, ttl) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.createdAt > ttl) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function put(key, value) {
  cache.set(key, { value, createdAt: Date.now() });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return value;
}

function compactThumbnail(item) {
  if (item.id) return `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
  return item.thumbnail || item.thumb || item.image || null;
}

async function requestOnce(key, request, ttl) {
  const hit = cached(key, ttl);
  if (hit) return hit;
  if (!inflight.has(key)) {
    inflight.set(key, Promise.resolve().then(request).then((value) => put(key, value))
      .finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}

async function search(query) {
  const data = await requestOnce(
    `search:${String(query).trim().toLowerCase()}`,
    async () => {
      const response = await axios.get(`${BASE_URL}/api/video/search`, {
        params: { songName: query },
        timeout: 90000
      });
      return Array.isArray(response.data) ? response.data : [];
    },
    SEARCH_TTL
  );
  return data.map((item) => ({ ...item, thumbnail: compactThumbnail(item) }));
}

async function lyricsSearch(query) {
  const data = await requestOnce(
    `lyrics:${String(query).trim().toLowerCase()}`,
    async () => {
      const response = await axios.get(`${BASE_URL}/api/video/lyrics`, {
        params: { songName: query },
        timeout: 90000
      });
      return Array.isArray(response.data) ? response.data : [];
    },
    SEARCH_TTL
  );
  return data.map((item) => ({ ...item, thumbnail: compactThumbnail(item) }));
}

async function resolveDownload(link, format = "mp4") {
  const key = `download:${format}:${link}`;
  return requestOnce(
    key,
    async () => {
      const response = await axios.get(`${BASE_URL}/api/video/download`, {
        params: { link, format },
        timeout: 90000
      });
      if (!response.data?.downloadLink) throw new Error("Video API returned no download link");
      return response.data;
    },
    DOWNLOAD_TTL
  );
}

module.exports = { search, lyricsSearch, resolveDownload, BASE_URL };