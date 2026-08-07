const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

// 👇 এখানে আপনার YouTube search API এর URL বসান
// উদাহরণ: const API_URL = "https://your-api.onrender.com/ytSearch?query=";
const API_URL = "https://videos2-api.onrender.com/search";

module.exports = {
  config: {
    name: "videos2",
    version: "1.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "media",
    shortDescription: "Search & download videos",
    longDescription: "Search YouTube videos and download by replying with a number",
    guide: "{pn} <search query>"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const query = args.join(" ");
    const hasReaction = typeof api.setMessageReaction === "function";

    if (!query) {
      return api.sendMessage(
        "❌ | Please provide a search query!\nExample: videos2 funny cat",
        threadID,
        messageID
      );
    }

    try {
      if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

      const response = await axios.get(
  `${API_URL}?query=${encodeURIComponent(query)}&pages=1`
);
      const data = response.data;

      // API রেসপন্স স্ট্রাকচার হ্যান্ডেল করার জন্য (API ভেদে ভিন্ন হতে পারে)
      let results = [];
      if (Array.isArray(data)) results = data;
      else if (Array.isArray(data?.results)) results = data.results;
      else if (Array.isArray(data?.videos)) results = data.videos;
      else if (Array.isArray(data?.data)) results = data.data;

      const videos = results.slice(0, 10);

      if (!videos.length) {
        if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
        return api.sendMessage("❌ | No videos found for your query.", threadID, messageID);
      }

      let msgBody = "🔎 | Search Results:\n\n";
      videos.forEach((v, i) => {
        const title = v.title || v.name || "Unknown Title";
        const duration = v.timestamp || v.duration || "";
        msgBody += `${i + 1}. ${title}${duration ? ` (${duration})` : ""}\n`;
      });
      msgBody += `\n👉 Reply with a number (1-${videos.length}) to get that video.`;

      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

      return api.sendMessage(msgBody, threadID, (err, info) => {
        if (!err && info?.messageID && this.replyManager) {
          this.replyManager.set(info.messageID, {
            commandName: this.config.name,
            author: senderID,
            videos
          });
        }
      }, messageID);
    } catch (err) {
      console.error(err);
      if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
      return api.sendMessage(
        "❌ | The video search API is currently unavailable or returned an error. Please try again later.",
        threadID,
        messageID
      );
    }
  },

  onReply: async function ({ api, event, Reply }) {
    const { threadID, messageID, senderID, body } = event;

    // শুধুমাত্র যে ইউজার সার্চ করেছে সে-ই রিপ্লাই দিতে পারবে
    if (senderID !== Reply.author) return;

    const hasReaction = typeof api.setMessageReaction === "function";
    const choice = parseInt(body);

    if (isNaN(choice) || choice < 1 || choice > Reply.videos.length) {
      return api.sendMessage(
        `❌ | Invalid choice. Reply with a number between 1 and ${Reply.videos.length}.`,
        threadID,
        messageID
      );
    }

    const selectedVideo = Reply.videos[choice - 1];
    const videoUrl = selectedVideo.url || selectedVideo.link || selectedVideo.download_url;

    if (!videoUrl) {
      return api.sendMessage(
        `❌ | No direct download URL found for: ${selectedVideo.title || "this video"}`,
        threadID,
        messageID
      );
    }

    let filePath;
    try {
      if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

      const cacheDir = path.join(__dirname, "cache");
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      filePath = path.join(cacheDir, `video2_${Date.now()}.mp4`);

      const stream = await axios({
        method: "GET",
        url: videoUrl,
        responseType: "stream",
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      const writer = fs.createWriteStream(filePath);
      stream.data.pipe(writer);

      writer.on("finish", () => {
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        api.sendMessage(
          {
            body: `▶️ | Here is your video: ${selectedVideo.title || ""}`,
            attachment: fs.createReadStream(filePath)
          },
          threadID,
          () => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          },
          messageID
        );
      });

      writer.on("error", (err) => {
        console.error("videos2 write error:", err);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
        api.sendMessage(`❌ | Error downloading the video.`, threadID, messageID);
      });
    } catch (err) {
      console.error("videos2 fetch error:", err);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
      return api.sendMessage(`❌ | Failed to fetch the video.`, threadID, messageID);
    }
  }
};
