/**
 * Riyad Bot Framework
 * Search a song, send five result images, then download the selected song
 * when the user replies with a number from 1 to 5.
 *
 * Supported commands:
 *   sing <song name>
 *   song <song name>
 *   gan <song name>
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const replyManager = require("../replies/replyManager");

const BASE_URL_LIST =
  "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json";
const SEARCH_API = "https://videos2-api.onrender.com/search";
const FALLBACK_MAHMUD_API = "https://mahmud-apis-q6hw.onrender.com";
const RESULT_LIMIT = 5;

function hasReaction(api) {
  return typeof api.setMessageReaction === "function";
}

function react(api, emoji, messageID) {
  if (hasReaction(api)) {
    api.setMessageReaction(emoji, messageID, () => {}, true);
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function getYouTubeId(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/
  );
  return match ? match[1] : /^[\w-]{11}$/.test(value) ? value : null;
}

function getThumbnail(item) {
  const direct =
    item.thumbnail ||
    item.thumbnailUrl ||
    item.thumbnail_url ||
    item.image ||
    item.imageUrl ||
    item.image_url ||
    item.thumb;

  if (typeof direct === "string" && /^https?:\/\//i.test(direct)) {
    return direct;
  }

  const videoId = getYouTubeId(
    item.url || item.link || item.videoUrl || item.video_url || item.id
  );
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function normalizeResults(payload) {
  const rawResults =
    (payload && (payload.results || payload.data || payload.items || payload.videos)) ||
    payload;

  return asArray(rawResults)
    .map((item) => {
      if (typeof item === "string") {
        return { title: item, url: item, thumbnail: getThumbnail({ url: item }) };
      }

      if (!item || typeof item !== "object") return null;

      const title = String(
        item.title || item.name || item.song || item.track || "Unknown song"
      ).trim();
      const url =
        item.url ||
        item.link ||
        item.videoUrl ||
        item.video_url ||
        (getYouTubeId(item.id) ? `https://youtu.be/${item.id}` : null);

      return {
        title,
        url,
        thumbnail: getThumbnail(item),
        duration: item.duration || item.timestamp || item.length || ""
      };
    })
    .filter((item) => item && item.title && (item.url || item.thumbnail))
    .slice(0, RESULT_LIMIT);
}

async function getMahmudBaseUrl() {
  try {
    const response = await axios.get(BASE_URL_LIST, {
      timeout: 8000,
      headers: { "User-Agent": "Riyad-Bot/1.0" }
    });

    const configured = response.data && response.data.mahmud;
    const url = Array.isArray(configured) ? configured[0] : configured;
    if (typeof url === "string" && url.trim()) {
      return url.replace(/\/+$/, "");
    }
  } catch (error) {
    console.error("[SONG] Could not load base API URL:", error.message);
  }

  return FALLBACK_MAHMUD_API;
}

async function downloadToFile(url, filePath, timeout = 30000) {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout,
    maxRedirects: 5,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json") || contentType.includes("text/html")) {
    response.data.destroy();
    throw new Error("The API returned an invalid media response.");
  }

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });

  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error("The downloaded file was empty.");
  }
}

async function downloadSearchImages(results, cacheDir) {
  const imagePaths = [];

  for (let index = 0; index < results.length; index += 1) {
    const imageUrl = results[index].thumbnail;
    if (!imageUrl) continue;

    const imagePath = path.join(
      cacheDir,
      `song_search_${Date.now()}_${index}.jpg`
    );

    try {
      await downloadToFile(imageUrl, imagePath, 15000);
      imagePaths.push(imagePath);
    } catch (error) {
      console.error(`[SONG] Thumbnail ${index + 1} failed:`, error.message);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
  }

  return imagePaths;
}

function removeFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      console.error("[SONG] Cache cleanup failed:", error.message);
    }
  }
}

module.exports = {
  config: {
    name: "song",
    aliases: ["sing", "gan", "গান"],
    version: "2.0.0",
    author: "Riyad",
    countDown: 10,
    role: 0,
    description: {
      en: "Search a song, show five images, and download it by replying with a number",
      bn: "গান সার্চ করে ৫টি ছবি দেখান এবং নম্বর রিপ্লাই দিয়ে গান ডাউনলোড করুন"
    },
    category: "music",
    guide: {
      en: "{pn} <song name> — reply with 1-5 to download",
      bn: "{pn} <গানের নাম> — ডাউনলোড করতে ১-৫ নম্বর রিপ্লাই দিন"
    }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const query = args.join(" ").trim();

    if (!query) {
      return api.sendMessage(
        "× গানের নাম লিখুন।\nউদাহরণ: sing shape of you",
        threadID,
        messageID
      );
    }

    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    react(api, "⏳", messageID);

    try {
      const response = await axios.get(SEARCH_API, {
        params: { query, pages: 1 },
        timeout: 25000,
        headers: { "User-Agent": "Riyad-Bot/1.0" }
      });
      const results = normalizeResults(response.data);

      if (!results.length) {
        react(api, "❌", messageID);
        return api.sendMessage(
          `× "${query}" নামে কোনো গান পাওয়া যায়নি।`,
          threadID,
          messageID
        );
      }

      const imagePaths = await downloadSearchImages(results, cacheDir);
      const imageAttachments = imagePaths.map((filePath) =>
        fs.createReadStream(filePath)
      );
      let body = `🎵 "${query}" এর জন্য ৫টি গান পাওয়া গেছে:\n\n`;

      results.forEach((result, index) => {
        body += `${index + 1}. ${result.title}`;
        if (result.duration) body += ` (${result.duration})`;
        body += "\n";
      });
      body += "\nডাউনলোড করতে এই মেসেজের reply-তে ১-৫ লিখুন।";

      const message = imageAttachments.length
        ? { body, attachment: imageAttachments }
        : body;

      return api.sendMessage(
        message,
        threadID,
        (error, info) => {
          removeFiles(imagePaths);
          if (!error && info && info.messageID) {
            replyManager.set(info.messageID, {
              commandName: this.config.name,
              author: senderID,
              results
            });
          }
        },
        messageID
      );
    } catch (error) {
      console.error("[SONG SEARCH ERROR]", error.response?.data || error.message);
      react(api, "❌", messageID);
      return api.sendMessage(
        `× গান সার্চ API error: ${error.message}`,
        threadID,
        messageID
      );
    }
  },

  onReply: async function ({ api, event, Reply }) {
    const { threadID, messageID, senderID } = event;
    if (String(senderID) !== String(Reply.author)) return;

    const input = String(event.body || "").trim();
    if (!/^[1-5]$/.test(input)) {
      return api.sendMessage(
        "× শুধু ১ থেকে ৫-এর মধ্যে একটি নম্বর reply দিন।",
        threadID,
        messageID
      );
    }

    const selected = Reply.results[Number(input) - 1];
    if (!selected) {
      return api.sendMessage(
        "× এই নম্বরের কোনো গান পাওয়া যায়নি। আবার ১-৫ reply দিন।",
        threadID,
        messageID
      );
    }

    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `song_${Date.now()}.mp3`);
    react(api, "⏳", messageID);

    try {
      const baseUrl = await getMahmudBaseUrl();
      const songUrl = `${baseUrl}/api/song/mahmud?query=${encodeURIComponent(
        selected.title
      )}`;

      await downloadToFile(songUrl, filePath, 120000);
      react(api, "✅", messageID);

      return api.sendMessage(
        {
          body: `✅ আপনার গান:\n🎵 ${selected.title}`,
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        (error) => {
          if (error) console.error("[SONG SEND ERROR]", error);
          removeFiles([filePath]);
        },
        messageID
      );
    } catch (error) {
      console.error("[SONG DOWNLOAD ERROR]", error.response?.data || error.message);
      removeFiles([filePath]);
      react(api, "❌", messageID);
      return api.sendMessage(
        `× গান ডাউনলোড করা যায়নি: ${error.message}`,
        threadID,
        messageID
      );
    }
  }
};
