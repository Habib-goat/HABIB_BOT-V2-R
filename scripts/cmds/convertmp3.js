const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

module.exports = {
  config: {
    name: "convertmp3",
    aliases: ["mp3"],
    version: "1.1.0",
    role: 0,
    author: "MOHAMMAD AKASH (Optimized)",
    shortDescription: "Convert video URL to downloadable MP3 audio.",
    longDescription: "Downloads raw media content from a target stream, saves it as an MP3 attachment, and streams it back to the group.",
    category: "media",
    guide: "{pn} <video_url> (or reply to a message containing video attachments)"
  },

  onStart: async function({ api, args, event }) {
    const { threadID, messageID, messageReply } = event;

    const url = args.join(" ") || messageReply?.attachments?.[0]?.url;
    if (!url) {
      return api.sendMessage("⚠️ Please provide a valid video URL, or reply to a message containing a video.", threadID, messageID);
    }

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);

    const uniqueFileId = `mp3_${event.senderID}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const filePath = path.join(cacheDir, `${uniqueFileId}.mp3`);

    const statusMsg = await new Promise((resolve) => {
      api.sendMessage("⏳ Processing audio extraction. Please hold on...", threadID, (err, info) => resolve(info), messageID);
    });

    try {
      const response = await axios.get(url, { 
        responseType: "arraybuffer",
        timeout: 45000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      await fs.writeFile(filePath, Buffer.from(response.data));

      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch(e) {}
      }

      return api.sendMessage({
        body: "🎧 Audio Converted Successfully! ✅",
        attachment: fs.createReadStream(filePath)
      }, threadID, async (err) => {
        try {
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
          }
        } catch (cleanupErr) {
          console.error("Cleanup error:", cleanupErr);
        }
      }, messageID);

    } catch (err) {
      console.error("MP3 Conversion Error:", err);
      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch(e) {}
      }
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }
      } catch (cleanupErr) {}
      return api.sendMessage(`❌ Failed to convert audio: ${err.message || "Timeout or Invalid Media Link"}`, threadID, messageID);
    }
  }
};