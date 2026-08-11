const axios = require("axios");
const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "song",
    aliases: ["sing", "music"],
    version: "1.0.1",
    author: "RiYad",
    countDown: 5,
    role: 0,
    category: "music",
    shortDescription: "Play a song",
    longDescription: "Search and send music from YouTube",
    guide: "{pn} <song name>"
  },

  onStart: async function ({ api, event, args }) {
    try {
      const query = args.join(" ");

      if (!query) {
        return api.sendMessage(
          "❌ | Please provide a song name.",
          event.threadID,
          event.messageID
        );
      }

      api.setMessageReaction?.("🪶", event.messageID, () => {}, true);

      const search = await axios.get(
        `https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json}`
      );

      const parseDuration = (time) => {
        const parts = time.split(":").map(Number);

        if (parts.length === 3)
          return parts[0] * 3600 + parts[1] * 60 + parts[2];

        if (parts.length === 2)
          return parts[0] * 60 + parts[1];

        return 0;
      };

      const videos = search.data.filter((item) => {
        try {
          return parseDuration(item.timestamp) < 600;
        } catch {
          return false;
        }
      });

      if (!videos.length) {
        return api.sendMessage(
          "❌ | No song found under 10 minutes.",
          event.threadID,
          event.messageID
        );
      }

      const video = videos[0];

      const song = await axios.get(
        `https://mostakim.onrender.com/m/sing?url=${encodeURIComponent(video.url)}`
      );

      if (!song.data || !song.data.url) {
        return api.sendMessage(
          "❌ | Failed to get audio link.",
          event.threadID,
          event.messageID
        );
      }

      const filePath = path.join(__dirname, `song_${Date.now()}.m4a`);

      const response = await axios({
        url: song.data.url,
        method: "GET",
        responseType: "stream"
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      api.setMessageReaction?.("✅", event.messageID, () => {}, true);

      api.sendMessage(
        {
          body:
            `🎵 ${video.title}\n\n` +
            `⏱ Duration: ${video.timestamp}\n` +
            `📺 Channel: ${video.author || "Unknown"}`,
          attachment: fs.createReadStream(filePath)
        },
        event.threadID,
        () => {
          fs.unlink(filePath, () => {});
        },
        event.messageID
      );

    } catch (err) {
      console.error(err);

      api.sendMessage(
        `❌ | ${err.message}`,
        event.threadID,
        event.messageID
      );
    }
  }
};
