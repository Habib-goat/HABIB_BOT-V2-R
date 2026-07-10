const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const ytSearch = require("yt-search");

const apiListUrl = "https://raw.githubusercontent.com/aryannix/stuffs/master/raw/apis.json";

module.exports = {
  config: {
    name: "sing",
    aliases: ["song", "music", "play"],
    version: "1.1.0",
    author: "ArYAN (Optimized)",
    countDown: 10,
    role: 0,
    category: "media",
    description: "Search YouTube and download raw audio track streams.",
    guide: "{pn} [Song Title or YouTube URL]"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const query = args.join(" ");
    if (!query) {
      return api.sendMessage("⚠️ Please provide a song name or YouTube link.\nExample: sing Faded", threadID, messageID);
    }

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);

    const uniqueFileId = `sing_${event.senderID}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const tempAudioPath = path.join(cacheDir, `${uniqueFileId}.mp3`);

    api.setMessageReaction("⏳", messageID, () => {}, true);

    try {
      const apiResponse = await axios.get(apiListUrl, { timeout: 8000 });
      const apiServerBase = apiResponse.data?.api;
      if (!apiServerBase) throw new Error("Could not fetch healthy API downloader nodes.");
      
      let videoUrl = query;
      let videoTitle = "Song Attachment";

      if (!query.startsWith("http")) {
        const searchResults = await ytSearch(query);
        const topVideo = searchResults?.videos?.[0];
        if (!topVideo) throw new Error("No video results found on YouTube. Check spelling.");
        videoUrl = topVideo.url;
        videoTitle = topVideo.title;
      }

      const ytdlResponse = await axios.get(`${apiServerBase}/ytdl`, {
        params: { url: videoUrl, type: "audio" },
        timeout: 25000
      });

      if (!ytdlResponse.data?.status || !ytdlResponse.data?.downloadUrl) {
        throw new Error("The third-party YouTube API returned an invalid stream link.");
      }

      const downloadUrl = ytdlResponse.data.downloadUrl;
      const finalTitle = ytdlResponse.data.title || videoTitle;

      const audioBuffer = await axios.get(downloadUrl, { 
        responseType: "arraybuffer",
        timeout: 45000 
      });

      await fs.outputFile(tempAudioPath, Buffer.from(audioBuffer.data));

      api.setMessageReaction("✅", messageID, () => {}, true);

      return api.sendMessage({
        body: `🎵 Title: ${finalTitle}\n🔗 Source: &videoUrl`,
        attachment: fs.createReadStream(tempAudioPath)
      }, threadID, async () => {
        try {
          if (await fs.pathExists(tempAudioPath)) {
            await fs.remove(tempAudioPath);
          }
        } catch (cleanupErr) {}
      }, messageID);

    } catch (err) {
      console.error("Sing Command Failed:", err.message);
      api.setMessageReaction("❌", messageID, () => {}, true);
      
      try {
        if (await fs.pathExists(tempAudioPath)) {
          await fs.remove(tempAudioPath);
        }
      } catch (cleanupErr) {}

      return api.sendMessage(`❌ Sing Error: ${err.message || "Network timeout"}`, threadID, messageID);
    }
  }
};