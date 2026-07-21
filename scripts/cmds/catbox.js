const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { downloadFile } = require("../utils/index");
/*
function getMimeType(ext) {
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".apk": "application/vnd.android.package-archive"
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}
*/
module.exports = {
  config: {
    name: "catbox",
    version: "1.2.0",
    author: "EryXenX & Kshitiz",
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
      await downloadFile(attachment.url, filePath);

      if (!fs.existsSync(filePath)) {
        throw new Error("Downloaded file could not be saved to disk.");
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        throw new Error("Downloaded file is empty (0 bytes).");
      }

      const form = new FormData();
      form.append("reqtype", "fileupload");
      form.append("fileToUpload", fs.createReadStream(filePath), path.basename(filePath));


      
      const uploadResponse = await axios.post(
  "https://catbox.moe/user/api.php",
  form,
  {
    headers: {
  ...form.getHeaders(),
  "User-Agent": "Mozilla/5.0"
},
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000,
    validateStatus: () => true,
  }
);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (processingMsg) {
        try { await api.unsendMessage(processingMsg.messageID); } catch (e) {}
      }

      const directLink = uploadResponse.data ? uploadResponse.data.toString().trim() : "";
      
      if (!directLink || !directLink.startsWith("https://files.catbox.moe/")) {
        throw new Error("Catbox returned an invalid response.\nServer Response: " + directLink);
      }

      return api.sendMessage(
        "📤 Catbox Upload Success!\n\n🔗 Direct Link:\n" + directLink,
        threadID,
        messageID
      );

    } catch (err) {
      console.error("Catbox Upload Failed:", err);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
      if (processingMsg) {
        try { await api.unsendMessage(processingMsg.messageID); } catch (e) {}
      }

      let reason = err.message || "An unknown network or execution error occurred.";
      let serverResponse = "";

      if (err.response) {
        reason = "HTTP Error Code " + err.response.status + " (" + err.response.statusText + ")";
        serverResponse = typeof err.response.data === "object" 
          ? JSON.stringify(err.response.data) 
          : err.response.data ? err.response.data.toString() : "";
      }

      let errorMsg = "❌ Catbox Upload Failed\n\nReason:\n" + reason;
      if (serverResponse) {
        errorMsg += "\n\nServer Response:\n" + serverResponse;
      }

      return api.sendMessage(errorMsg, threadID, messageID);
    }
  }
};
