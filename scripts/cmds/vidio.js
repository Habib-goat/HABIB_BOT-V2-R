const axios = require("axios");
const fs = require("fs");
const path = require("path");

let cachedBaseApiUrl = null;

async function baseApiUrl() {
  if (cachedBaseApiUrl) return cachedBaseApiUrl;
  try {
    const res = await axios.get(
      "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
      { timeout: 5000 }
    );
    if (res.data?.mahmud) {
      cachedBaseApiUrl = res.data.mahmud;
      return cachedBaseApiUrl;
    }
  } catch {}
  return "https://mahmud-rest-api-v9.onrender.com";
}

module.exports = {
  config: {
    name: "vidio",
    aliases: ["ভিডিও", "video", "vid"],
    version: "2.3.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "media",
    description: { en: "Download YouTube videos" },
    guide: { en: "{pn} <name/link>" }
  },

  langs: {
    en: {
      noInput: "Please provide a video name or link.",
      noResult: "No result found.",
      success: "🎬 %1",
      error: "Error: %1"
    }
  },

  onStart: async function ({ api, event, args, getLang }) {
    try {
      if (!args.length)
        return api.sendMessage(
          getLang ? getLang("noInput") : "Please provide a video name or link.",
          event.threadID,
          event.messageID
        );

      if (typeof api.setMessageReaction === "function")
        api.setMessageReaction("🐤", event.messageID, () => {}, true);

      const apiUrl = await baseApiUrl();

      const yt = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})/;
      let videoID;

      if (yt.test(args[0])) {
        videoID = args[0].match(yt)[1];
      } else {
        const search = await axios.get(
          `${apiUrl}/api/video/search?songName=${encodeURIComponent(args.join(" "))}`,
          { timeout: 10000 }
        );

        console.log("SEARCH:", JSON.stringify(search.data, null, 2));

        if (!Array.isArray(search.data) || !search.data.length)
          return api.sendMessage(
            getLang ? getLang("noResult") : "No result found.",
            event.threadID,
            event.messageID
          );

        videoID = search.data[0].id;
      }

      const cache = path.join(__dirname, "cache");
      if (!fs.existsSync(cache))
        fs.mkdirSync(cache, { recursive: true });

      const file = path.join(cache, `video_${Date.now()}.mp4`);

      const info = await axios.get(
        `${apiUrl}/api/video/download?link=${videoID}&format=mp4`,
        { timeout: 15000 }
      );

      console.log("DOWNLOAD:", JSON.stringify(info.data, null, 2));
      console.log("DOWNLOAD LINK:", info.data.downloadLink);

      const video = await axios.get(info.data.downloadLink, {
        responseType: "arraybuffer",
        timeout: 30000
      });

      fs.writeFileSync(file, video.data);

      api.sendMessage(
        {
          body: getLang ? getLang("success", info.data.title) : `🎬 ${info.data.title}`,
          attachment: fs.createReadStream(file)
        },
        event.threadID,
        () => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        },
        event.messageID
      );
    } catch (err) {
      console.error(err);
      api.sendMessage(
        getLang ? getLang("error", err.message) : `Error: ${err.message}`,
        event.threadID,
        event.messageID
      );
    }
  }
};
