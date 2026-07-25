const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// Pixeldrain API Key configuration
const PIXELDRAIN_API_KEY = "957c1753-9cea-403e-965f-88ec39b62478";

/**
 * Format bytes into human readable size string
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Infer extension based on attachment type or mime
 */
function inferExtension(type, url = "") {
  const cleanUrl = url.split("?")[0].toLowerCase();
  const urlExt = path.extname(cleanUrl);
  if (urlExt && urlExt.length <= 5 && urlExt.length > 1) {
    return urlExt;
  }

  const typeLower = (type || "").toLowerCase();
  if (typeLower.includes("photo") || typeLower.includes("image")) return ".jpg";
  if (typeLower.includes("animated_image") || typeLower.includes("gif")) return ".gif";
  if (typeLower.includes("video")) return ".mp4";
  if (typeLower.includes("audio") || typeLower.includes("voice") || typeLower.includes("music")) return ".mp3";
  if (typeLower.includes("sticker")) return ".png";

  return ".bin";
}

/**
 * Helper to download file with timeout and retry
 */
async function downloadAttachment(url, destPath, retries = 2) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      const response = await axios({
        method: "GET",
        url: url,
        responseType: "stream",
        timeout: 60000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });

      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        return true;
      }
      throw new Error("Downloaded file is empty");
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt <= retries) {
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
  }
  throw lastError || new Error("Failed to download attachment after retries.");
}

/**
 * Helper to upload file to Pixeldrain API with retry
 */
async function uploadToPixeldrain(filePath, filename, apiKey, retries = 2) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(filePath), filename);
      form.append("name", filename);

      const headers = form.getHeaders();
      if (apiKey && apiKey !== "PUT_YOUR_API_KEY_HERE" && apiKey.trim() !== "") {
        const authBuffer = Buffer.from(":" + apiKey.trim()).toString("base64");
        headers["Authorization"] = `Basic ${authBuffer}`;
      }

      const response = await axios.post("https://pixeldrain.com/api/file", form, {
        headers: headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 180000
      });

      if (response.data && response.data.id) {
        return response.data;
      } else {
        throw new Error("Invalid response format from Pixeldrain.");
      }
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt <= retries) {
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }

  throw lastError || new Error("Failed to upload file to Pixeldrain.");
}

module.exports = {
  config: {
  name: "upload",
  version: "1.0.0",
  author: "Bad Boy Riyad",
  role: 0,
  cooldowns: 5,
  category: "media",

  shortDescription: "Upload Messenger attachment",
  longDescription: "Reply to any Messenger attachment and upload it to Pixeldrain.",
  guide: "{pn} (reply to any attachment)",

  description: "Download any Messenger attachment and upload it to Pixeldrain."
},

  onStart: async function({ api, event, args, usersData, threadsData }) {
    const threadID = event.threadID;
    const messageID = event.messageID;

    // 1. Detect Attachment from Reply or Current Event
    let attachment = null;

console.log("messageReply =", JSON.stringify(event.messageReply, null, 2));

let attachment =
  event.messageReply?.attachments?.[0] ||
  event.messageReply?.message?.attachments?.[0] ||
  event.attachments?.[0] ||
  null;

if (!attachment) {
  return api.sendMessage(
    "⚠️ Please reply to a Messenger attachment.",
    threadID,
    messageID
  );
}

// Messenger attachment URL detect
attachment.url =
  attachment.url ||
  attachment.previewUrl ||
  attachment.preview_url ||
  attachment.largePreviewUrl ||
  attachment.playableUrl ||
  attachment.playable_url;

if (!attachment.url) {
  return api.sendMessage(
    "❌ This attachment doesn't contain a downloadable URL.",
    threadID,
    messageID
  );
}

    // 2. Determine Filename and Extension
    const rawType = attachment.type || "file";
    let originalName = attachment.filename || attachment.name || "";
    let ext = path.extname(originalName.split("?")[0]);

    if (!ext) {
      ext = inferExtension(rawType, attachment.url);
    }

    if (!originalName) {
      const timestamp = Date.now();
      originalName = `attachment_${timestamp}${ext}`;
    } else if (!path.extname(originalName)) {
      originalName = `${originalName}${ext}`;
    }

    // Sanitize filename
    const safeFilename = originalName.replace(/[/\\?%*:|"<>]/g, "_");

    // 3. Setup Cache Directory and Temporary File Path
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const tempFilePath = path.join(cacheDir, `${Date.now()}_${safeFilename}`);
    let progressMsg = null;

    try {
      // 4. Progress Notification - Downloading
      progressMsg = await new Promise((resolve) => {
        api.sendMessage("⏳ Downloading attachment...", threadID, (err, info) => {
          resolve(info || null);
        }, messageID);
      });

      // 5. Download Attachment
      await downloadAttachment(attachment.url, tempFilePath);

      // Verify file size
      const stats = fs.statSync(tempFilePath);
      if (stats.size === 0) {
        throw new Error("Downloaded attachment is 0 bytes.");
      }
      const fileSizeFormatted = formatBytes(stats.size);

      // 6. Progress Notification - Uploading
if (progressMsg && progressMsg.messageID && typeof api.unsendMessage === "function") {
  try {
    await api.unsendMessage(progressMsg.messageID);
  } catch (e) {}
}

progressMsg = await new Promise((resolve) => {
  api.sendMessage(
    "📤 Uploading to Pixeldrain...\n⏳ Please wait...",
    threadID,
    (err, info) => resolve(info || null),
    messageID
  );
});

      // 7. Upload to Pixeldrain
      const result = await uploadToPixeldrain(tempFilePath, safeFilename, PIXELDRAIN_API_KEY);

      // Delete progress message if possible
      if (progressMsg && progressMsg.messageID && typeof api.unsendMessage === "function") {
        try {
          await api.unsendMessage(progressMsg.messageID);
        } catch (_) {
          // Ignore unsendMessage error
        }
      }

      // 8. Construct Success Message
      const fileLink = `https://pixeldrain.com/u/${result.id}`;
      const successText = 
`✅ Upload Successful

━━━━━━━━━━━━━━

📄 File:
${safeFilename}

📦 Size:
${fileSizeFormatted}

🧩 Type:
${rawType.toUpperCase()}

🔗 Download Link:
${fileLink}

━━━━━━━━━━━━━━`;

      return api.sendMessage(successText, threadID, messageID);

    } catch (error) {

      console.log(error.response?.status);
console.log(error.response?.data);
      
      // Clean up progress message if an error occurred
      if (progressMsg && progressMsg.messageID && typeof api.unsendMessage === "function") {
        try {
          await api.unsendMessage(progressMsg.messageID);
        } catch (_) {}
      }

      const serverResponse = error.response && error.response.data
        ? JSON.stringify(error.response.data, null, 2)
        : (error.message || "Unknown error occurred.");

      const failureText = 
`❌ Upload Failed

Reason:
${error.message || "Upload process encountered an error."}

Server Response:
${serverResponse}`;

      return api.sendMessage(failureText, threadID, messageID);

    } finally {
      // 9. Clean up temporary cache file
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          console.error("Failed to delete temp file:", e);
        }
      }
    }
  }
};
