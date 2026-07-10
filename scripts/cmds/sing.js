const axios = require("axios");
const fs = require("fs");
const path = require("path");

let cachedApi = null;

async function baseApiUrl() {
  if (cachedApi) return cachedApi;

  try {
    const r = await axios.get(
      "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
      { timeout: 5000 }
    );

    if (r.data && r.data.mahmud) {
      cachedApi = r.data.mahmud;
      return cachedApi;
    }
  } catch (e) {}

  return "https://mahmud-rest-api-v9.onrender.com";
}

module.exports = {
  config: {
    name: "sing",
    aliases: ["song", "music", "play"],
    version: "2.0.0",
    author: "Riyad + ChatGPT",
    countDown: 5,
    role: 0,
    category: "media",
    description: {
      en: "Search and download song"
    },
    guide: {
      en: "{pn} <song name>"
    }
  },

  onStart: async function ({ api, event, args }) {
    try {
      if (!args.length)
        return api.sendMessage(
          "🎵 Please enter a song name.",
          event.threadID,
          event.messageID
        );

      if (typeof api.setMessageReaction === "function")
        api.setMessageReaction("⏳", event.messageID, () => {}, true);

      api.sendMessage(
        "🔎 Searching song...",
        event.threadID,
        event.messageID
      );

      const apiUrl = await baseApiUrl();

      const search = await axios.get(
        `${apiUrl}/api/video/search?songName=${encodeURIComponent(args.join(" "))}`,
        { timeout: 10000 }
      );

      if (!Array.isArray(search.data) || !search.data.length)
        return api.sendMessage(
          "❌ Song not found.",
          event.threadID,
          event.messageID
        );

      const videoID = search.data[0].id;

      // তোমার API যদি format=mp3 সমর্থন করে তাহলে কাজ করবে
      const info = await axios.get(
        `${apiUrl}/api/video/download?link=${videoID}&format=mp3`,
        { timeout: 15000 }
      );

      if (!info.data || !info.data.downloadLink)
        return api.sendMessage(
          "❌ Audio download link not found.",
          event.threadID,
          event.messageID
        );

      const cache = path.join(__dirname, "cache");
      if (!fs.existsSync(cache))
        fs.mkdirSync(cache, { recursive: true });

      const file = path.join(cache, `song_${Date.now()}.mp3`);

      const audio = await axios.get(info.data.downloadLink, {
        responseType: "arraybuffer",
        timeout: 30000
      });

      fs.writeFileSync(file, audio.data);

      if (typeof api.setMessageReaction === "function")
        api.setMessageReaction("✅", event.messageID, () => {}, true);

      api.sendMessage(
        {
          body: `🎵 ${info.data.title || "Song"}`,
          attachment: fs.createReadStream(file)
        },
        event.threadID,
        () => fs.unlink(file, () => {}),
        event.messageID
      );

    } catch (err) {
      console.error("[SING ERROR]", err);

      if (typeof api.setMessageReaction === "function")
        api.setMessageReaction("❌", event.messageID, () => {}, true);

      api.sendMessage(
        `❌ ${err.message}`,
        event.threadID,
        event.messageID
      );
    }
  }
};
