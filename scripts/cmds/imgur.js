const axios = require('axios');

module.exports = {
  config: {
    name: "imgur",
    version: "1.1.0",
    author: "MOHAMMAD AKASH (Optimized)",
    role: 0,
    shortDescription: "Upload media attachments directly to Imgur.",
    longDescription: "Reply to any image, video, or GIF. Uploads all attachments concurrently and returns direct Imgur sharing URLs.",
    category: "media",
    guide: "Reply to any photo or video with: imgur",
    cooldowns: 3
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID, messageReply } = event;

    if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
      return api.sendMessage(
        "⚠️ Please reply to an image, video, or GIF with 'imgur' to upload.",
        threadID,
        messageID
      );
    }

    let imgurApiBaseUrl;
    try {
      const apis = await axios.get('https://raw.githubusercontent.com/shaonproject/Shaon/main/api.json', { timeout: 8000 });
      imgurApiBaseUrl = apis.data.imgur;
    } catch (err) {
      imgurApiBaseUrl = "https://shaon-imgur-upload.free.beeceptor.com" || "https://api.imgur.com/3/image";
      console.warn("API list offline. Resorting to primary lookup fallback.");
    }

    api.sendMessage("⏳ Concurrently uploading attachments to Imgur...", threadID, messageID);

    const uploadPromises = messageReply.attachments.map(async (attachment, index) => {
      try {
        const fileUrl = encodeURIComponent(attachment.url);
        const res = await axios.get(`${imgurApiBaseUrl}/imgur?link=${fileUrl}`, { timeout: 25000 });
        
        return res.data?.uploaded?.image || res.data?.data?.link || `❌ Link missing for index ${index + 1}`;
      } catch (err) {
        return `❌ Failed to upload item ${index + 1}: ${err.message}`;
      }
    });

    const links = await Promise.all(uploadPromises);

    const messageToSend = links.length === 1
      ? `🖼️ Imgur Direct Link:\n${links[0]}`
      : `✅ Concurrently Uploaded Imgur Links:\n\n` + links.map((link, idx) => `[${idx + 1}] ${link}`).join("\n");

    return api.sendMessage(messageToSend, threadID, messageID);
  }
};