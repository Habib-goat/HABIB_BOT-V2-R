"use strict";

const axios = require("axios");
const fs = require("fs");
const { pipeline } = require("stream/promises");

const LINK_CACHE_TTL = 60 * 1000;
const downloadLinkCache = new Map();
const downloadLinkInflight = new Map();

function cacheGet(key) {
  const entry = downloadLinkCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > LINK_CACHE_TTL) {
    downloadLinkCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  downloadLinkCache.set(key, { value, createdAt: Date.now() });
  if (downloadLinkCache.size > 100) {
    downloadLinkCache.delete(downloadLinkCache.keys().next().value);
  }
  return value;
}

/**
 * Resolve a short-lived YouTube stream URL once per video/format, then reuse
 * it for a short period. The API's own cache remains the source of truth.
 */
async function resolveDownloadCached(resolveDownload, id, format) {
  const key = `${String(id)}::${String(format).toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let request = downloadLinkInflight.get(key);
  if (!request) {
    request = Promise.resolve()
      .then(() => resolveDownload(id, format))
      .then((value) => {
        if (!value || !value.downloadLink) {
          throw new Error("No downloadable stream found");
        }
        return cacheSet(key, value);
      })
      .finally(() => downloadLinkInflight.delete(key));
    downloadLinkInflight.set(key, request);
  }
  return request;
}

/**
 * Stream the remote media straight to disk. The old arraybuffer approach
 * waited for the complete response in memory before writing anything.
 */
async function downloadToFile(url, filePath, timeout = 120000) {
  if (!url) throw new Error("Download URL is empty");

  const response = await axios.get(url, {
    responseType: "stream",
    timeout,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "*/*",
    },
  });

  await pipeline(response.data, fs.createWriteStream(filePath));
  return filePath;
}

module.exports = {
  downloadToFile,
  resolveDownloadCached,
};
