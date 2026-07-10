const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

module.exports = {
  config: {
    name: "catbox",
    version: "1.1.0",
    author: "EryXenX (Fixed)",
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
    
    // EXTREMELY ROBUST EXTENSION MAPPING
    let ext = ".png";
    if (attachment.type === "photo") {
      ext = ".png";
    } else if (attachment.type === "video") {
      ext = ".mp4";
    } else if (attachment.type === "audio") {
      ext = ".mp3";
    } else if (attachment.filename) {
      ext = path.extname(attachment.filename) || ".png";
    } else {
      const match = (attachment.url || "").match(/\.(png|jpg|jpeg|gif|mp4|mp3|pdf|txt|zip|apk|bin)/i);
      if (match) ext = "." + match[1].toLowerCase();
    }

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const filePath = path.join(cacheDir, "catbox_" + event.senderID + "_" + Date.now() + ext);

    const processingMsg = await new Promise((resolve) => {
      api.sendMessage("⏳ Downloading file and uploading to Catbox. Please wait...", threadID, (err, info) => resolve(info), messageID);
    });

    try {
      const response = await axios.get(attachment.url, { 
        responseType: "arraybuffer",
        timeout: 25000 
      });
      
      const buffer = Buffer.from(response.data);
      // Synchronous write ensures file is fully flushed on all disk/OS targets
      fs.writeFileSync(filePath, buffer);

      const form = new FormData();
      form.append("reqtype", "fileupload");
      form.append("fileToUpload", fs.createReadStream(filePath), {
        filename: "file" + ext
      });

      const uploadResponse = await axios.post(
        "https://catbox.moe/user/api.php",
        form,
        {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 45000
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
        "📤 Catbox Upload Success!\n\n🔗 Direct Link:\n" + directLink,
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
        "❌ Catbox Upload Failed: " + (err.message || "Timeout or Network error"),
        threadID,
        messageID
      );
    }
  }
};
