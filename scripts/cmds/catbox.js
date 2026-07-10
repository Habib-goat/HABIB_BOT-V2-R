const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

module.exports = {
  config: {
    name: "catbox",
    version: "1.1.0",
    author: "EryXenX (Optimized)",
    role: 0,
    shortDescription: "Upload media to Catbox.",
    longDescription: "Reply to any image, video, audio, or attachment file to upload it directly to Catbox.",
    category: "media",
    guide: "{pn} (replying to any attachment file)",
    cooldowns: 5
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID, messageReply } = event;

    if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
      return api.sendMessage(
        "⚠️ Please reply to an image, video, audio, or file to upload it to Catbox.",
        threadID,
        messageID
      );
    }

    const attachment = messageReply.attachments[0];
    const originalName = attachment.filename || "";
    const ext = originalName ? path.extname(originalName) : ".png";

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const filePath = path.join(cacheDir, `catbox_${event.senderID}_${Date.now()}${ext}`);

    const processingMsg = await new Promise((resolve) => {
      api.sendMessage("⏳ Downloading file and uploading to Catbox. Please wait...", threadID, (err, info) => resolve(info), messageID);
    });

    try {
      const fileStream = await axios({
        url: attachment.url,
        method: "GET",
        responseType: "stream",
        timeout: 20000
      });

      const writer = fs.createWriteStream(filePath);
      fileStream.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      const form = new FormData();
      form.append("reqtype", "fileupload");
      form.append("fileToUpload", fs.createReadStream(filePath));

      const uploadResponse = await axios.post(
        "https://catbox.moe/user/api.php",
        form,
        {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30000
        }
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (processingMsg) {
        try { await api.unsendMessage(processingMsg.messageID); } catch (e) {}
      }

      const directLink = uploadResponse.data.trim();
      return api.sendMessage(
        `📤 Catbox Upload Success!\n\n🔗 Direct Link:\n${directLink}`,
        threadID,
        messageID
      );

    } catch (err) {
      console.error("Catbox Upload Failed:", err);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (processingMsg) {
        try { await api.unsendMessage(processingMsg.messageID); } catch (e) {}
      }
      return api.sendMessage(
        `❌ Catbox Upload Failed: ${err.message || "Timeout or Network error"}`,
        threadID,
        messageID
      );
    }
  }
};