const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE_URL_CONFIG =
  "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json";

let cachedApi = null;

async function baseApiUrl() {
  if (cachedApi) return cachedApi;

  const response = await axios.get(BASE_URL_CONFIG, {
    timeout: 8000,
    headers: { "User-Agent": "Riyad-Bot/1.0" }
  });

  const configured = response.data && response.data.mahmud;
  const candidates = Array.isArray(configured) ? configured : [configured];
  const url = candidates.find(
    (value) => typeof value === "string" && /^https?:\/\//i.test(value)
  );

  if (!url) {
    throw new Error("baseApiUrl.json-এ কোনো valid MahMUD API URL পাওয়া যায়নি।");
  }

  cachedApi = url.replace(/\/+$/, "");
  return cachedApi;
}

function getYouTubeId(value) {
  if (!value || typeof value !== "string") return null;

  const match = value.match(
    /(?:youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/)|youtu\.be\/)([\w-]{11})/
  );

  return match ? match[1] : /^[\w-]{11}$/.test(value) ? value : null;
}

function parseSearchResults(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : payload?.results || payload?.data || payload?.items || [];

  return raw
    .map((item) => {
      if (typeof item === "string") {
        return { id: getYouTubeId(item), title: item };
      }

      if (!item || typeof item !== "object") return null;

      const id = getYouTubeId(
        item.id || item.videoId || item.videoID || item.url || item.link
      );

      return {
        id,
        title: item.title || item.name || "YouTube Video",
        duration: item.duration || item.timestamp || ""
      };
    })
    .filter((item) => item && item.id);
}

function removeFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

module.exports = {
  config: {
    name: "vidio",
    aliases: ["video", "vid", "ভিডিও"],
    version: "4.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "media",
    description: {
      en: "Download YouTube videos using the MahMUD API URL from baseApiUrl.json",
      bn: "baseApiUrl.json-এর MahMUD API ব্যবহার করে YouTube ভিডিও ডাউনলোড করুন"
    },
    guide: {
      en: "{pn} <name/link>",
      bn: "{pn} <ভিডিওর নাম বা YouTube লিংক>"
    }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    let filePath = null;

    try {
      if (!args.length) {
        return api.sendMessage(
          "📺 ভিডিওর নাম বা YouTube লিংক দিন।",
          threadID,
          messageID
        );
      }

      if (typeof api.setMessageReaction === "function") {
        api.setMessageReaction("⏳", messageID, () => {}, true);
      }

      const apiUrl = await baseApiUrl();
      const input = args.join(" ").trim();
      const directVideoId = getYouTubeId(input);
      let videoId = directVideoId;
      let searchedTitle = "YouTube Video";

      if (!videoId) {
        const search = await axios.get(`${apiUrl}/api/video/search`, {
          params: { songName: input },
          timeout: 20000,
          headers: { "User-Agent": "Riyad-Bot/1.0" }
        });

        const results = parseSearchResults(search.data);
        if (!results.length) {
          if (typeof api.setMessageReaction === "function") {
            api.setMessageReaction("❌", messageID, () => {}, true);
          }
          return api.sendMessage(
            "❌ কোনো ভিডিও পাওয়া যায়নি।",
            threadID,
            messageID
          );
        }

        videoId = results[0].id;
        searchedTitle = results[0].title;
      }

      const info = await axios.get(`${apiUrl}/api/video/download`, {
        params: { link: videoId, format: "mp4" },
        timeout: 30000,
        headers: { "User-Agent": "Riyad-Bot/1.0" }
      });

      const downloadLink = info.data && info.data.downloadLink;
      if (!downloadLink) {
        throw new Error("API থেকে video download link পাওয়া যায়নি।");
      }

      const cache = path.join(__dirname, "cache");
      fs.mkdirSync(cache, { recursive: true });
      filePath = path.join(cache, `video_${Date.now()}.mp4`);

      const video = await axios.get(downloadLink, {
        responseType: "arraybuffer",
        timeout: 120000,
        maxRedirects: 5,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      fs.writeFileSync(filePath, video.data);

      if (typeof api.setMessageReaction === "function") {
        api.setMessageReaction("✅", messageID, () => {}, true);
      }

      const title = info.data.title || searchedTitle || "YouTube Video";
      return api.sendMessage(
        {
          body: `🎬 ${title}`,
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        () => removeFile(filePath),
        messageID
      );
    } catch (error) {
      console.error("[VIDIO ERROR]", error.response?.data || error.message);
      removeFile(filePath);

      if (typeof api.setMessageReaction === "function") {
        api.setMessageReaction("❌", messageID, () => {}, true);
      }

      return api.sendMessage(
        `❌ ভিডিও ডাউনলোড করা যায়নি: ${error.message}`,
        threadID,
        messageID
      );
    }
  }
};
