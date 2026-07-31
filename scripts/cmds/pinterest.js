const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "pin",
    aliases: ["pinterest", "pint"],
    version: "1.2.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    description: "Search Pinterest and return image results.",
    category: "image",
    guide: "{pn} [keyword]-[count] (e.g. {pn} Naruto-10)"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const keySearch = args.join(" ");

    if (!keySearch || keySearch.includes("-") === false) {
      return api.sendMessage("❌ Example: pin Rahat-10", threadID, messageID);
    }

    const keySearchs = keySearch.substr(0, keySearch.indexOf("-"));
    const numberSearch = Math.max(1, parseInt(keySearch.split("-").pop()) || 6);

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);

    const statusMsg = await new Promise((resolve) => {
      api.sendMessage(`🔍 Searching Pinterest for "${keySearchs}"... Downloading ${numberSearch} image(s)...`, threadID, (err, info) => resolve(info), messageID);
    });

    const tempFiles = [];

    try {
      const imageUrls = await fetchPinterestImages(keySearchs, numberSearch);

      if (!imageUrls || imageUrls.length === 0) {
        if (statusMsg) try { await api.unsendMessage(statusMsg.messageID); } catch (e) {}
        return api.sendMessage("❌ No Pinterest results found (or all sources are currently down). Try again later.", threadID, messageID);
      }

      const attachments = [];

      const downloadPromises = imageUrls.map(async (imageUrl, idx) => {
        try {
          const fileId = `pin_${senderID}_${Date.now()}_${idx}.jpg`;
          const imagePath = path.join(cacheDir, fileId);

          const imgResponse = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 10000 });
          await fs.writeFile(imagePath, imgResponse.data);

          attachments.push(fs.createReadStream(imagePath));
          tempFiles.push(imagePath);
        } catch (err) {
          console.warn(`Failed to download Pinterest image ${idx + 1}:`, err.message);
        }
      });

      await Promise.all(downloadPromises);

      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch (e) {}
      }

      if (attachments.length === 0) {
        return api.sendMessage("❌ Failed to download Pinterest images. Please try again.", threadID, messageID);
      }

      return api.sendMessage({
        body: `📌 ${attachments.length} Pinterest results for: "${keySearchs}"`,
        attachment: attachments
      }, threadID, async () => {
        for (const filePath of tempFiles) {
          try {
            if (await fs.pathExists(filePath)) {
              await fs.remove(filePath);
            }
          } catch (e) {}
        }
      }, messageID);

    } catch (err) {
      console.error("Pin command error:", err);
      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch (e) {}
      }
      for (const filePath of tempFiles) {
        try { await fs.remove(filePath); } catch (e) {}
      }
      return api.sendMessage("⚠️ Failed to search Pinterest. All sources might be offline right now.", threadID, messageID);
    }
  }
};

/**
 * Tries multiple sources in order and returns as soon as one works.
 * 1) Direct scrape of Pinterest's own internal search endpoint (no middleman).
 * 2) Shaon api.json -> /pinterest?search=
 * 3) betadash-api (railway) -> /pinterest?search=
 */
async function fetchPinterestImages(query, count) {
  // 1) Direct scrape
  try {
    const urls = await scrapePinterestDirect(query, count);
    if (urls && urls.length > 0) return urls;
  } catch (err) {
    console.warn("[pin] Direct scrape failed:", err.message);
  }

  // 2) Shaon api.json
  try {
    const apis = await axios.get("https://raw.githubusercontent.com/shaonproject/Shaon/main/api.json", { timeout: 10000 });
    const base = apis.data.api;
    const res = await axios.get(`${base}/pinterest?search=${encodeURIComponent(query)}`, { timeout: 12000 });
    const data = res.data.data;
    if (Array.isArray(data) && data.length > 0) return data.slice(0, count);
  } catch (err) {
    console.warn("[pin] Shaon api fallback failed:", err.message);
  }

  // 3) betadash-api
  try {
    const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/pinterest?search=${encodeURIComponent(query)}&count=${count}`;
    const res = await axios.get(apiUrl, { timeout: 12000 });
    const data = res.data?.data;
    if (Array.isArray(data) && data.length > 0) return data.slice(0, count);
  } catch (err) {
    console.warn("[pin] betadash fallback failed:", err.message);
  }

  return [];
}

/**
 * Directly hits Pinterest's own internal "BaseSearchResource" endpoint
 * (the same one pinterest.com's search page itself calls in the browser).
 * Unofficial/reverse-engineered - Pinterest can change this at any time
 * without notice, which is why the fallbacks above exist.
 */
async function scrapePinterestDirect(query, count) {
  const dataParam = JSON.stringify({
    options: {
      isPrefetch: false,
      query: query,
      scope: "pins",
      no_fetch_context_on_resource: false
    },
    context: {}
  });

  const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(`/search/pins/?q=${query}`)}&data=${encodeURIComponent(dataParam)}&_=${Date.now()}`;

  const response = await axios.get(url, {
    timeout: 12000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
      "X-Requested-With": "XMLHttpRequest",
      "X-Pinterest-PWS-Handler": "www/search/[scope].js",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const results = response.data?.resource_response?.data?.results;
  if (!Array.isArray(results)) return [];

  const urls = [];
  for (const item of results) {
    if (urls.length >= count) break;
    const images = item?.images;
    if (!images) continue;
    // Prefer the highest quality available, fall back down the chain.
    const picked =
      images.orig?.url ||
      images["736x"]?.url ||
      images["474x"]?.url ||
      images["236x"]?.url;
    if (picked) urls.push(picked);
  }

  return urls;
}
