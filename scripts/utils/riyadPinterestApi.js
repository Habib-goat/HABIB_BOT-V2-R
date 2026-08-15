"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE_URL = (process.env.RIYAD_PINTEREST_API_URL || "https://riyad-pinterest-api.onrender.com").replace(/\/+$/, "");

function unwrapPinterestUrl(input) {
  let value = String(input || "").trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const parsed = new URL(value);
      const nested = parsed.searchParams.get("u") || parsed.searchParams.get("url");
      if (nested && /pinterest|pin\.it/i.test(nested)) {
        value = decodeURIComponent(nested);
        continue;
      }
    } catch (_) {}
    break;
  }
  return value;
}

function cleanMediaUrl(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^ytdl:/i, "");
  return /^https?:\/\//i.test(cleaned) ? cleaned : null;
}

async function search(query, limit = 10) {
  const response = await axios.get(`${BASE_URL}/api/pinterest/search`, {
    params: { query, limit },
    timeout: 90000
  });
  return Array.isArray(response.data) ? response.data : [];
}

async function getMediaById(id) {
  const response = await axios.get(`${BASE_URL}/api/pinterest/media`, {
    params: { id },
    timeout: 90000
  });
  return response.data;
}

async function resolveUrl(url) {
  const response = await axios.get(`${BASE_URL}/api/pinterest/resolve`, {
    params: { url: unwrapPinterestUrl(url) },
    timeout: 90000
  });
  return response.data;
}

function writeStreamToFile(stream, filePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    stream.pipe(output);
    stream.once("error", reject);
    output.once("finish", resolve);
    output.once("error", reject);
  });
}

async function downloadById(id, filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const response = await axios.get(`${BASE_URL}/api/pinterest/download`, {
    params: { id },
    responseType: "stream",
    timeout: 150000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  await writeStreamToFile(response.data, filePath);
  return filePath;
}

module.exports = {
  BASE_URL,
  cleanMediaUrl,
  unwrapPinterestUrl,
  search,
  getMediaById,
  resolveUrl,
  downloadById
};