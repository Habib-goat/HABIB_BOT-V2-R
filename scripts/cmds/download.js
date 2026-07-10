const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  config: {
    name: "autolink",
    aliases: ["al"],
    version: "1.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "media"
  },

  onStart: async function ({ api, event }) {
    return api.sendMessage(
      "╭───『 RIYAD BOT 』───╮\n" +
      "│ 🤖 AutoLink System Active\n" +
      "│ I automatically detect and download\n" +
      "│ links from your chat! Supports:\n" +
      "│ • FB, TikTok, IG, YT, X, Threads\n" +
      "│ • Direct files (mp4, mp3, webp, etc.)\n" +
      "│ Just send any link to begin.\n" +
      "╰─────────────────────╯",
      event.threadID,
      event.messageID
    );
  },

  onChat: async function ({ api, event }) {
    const { threadID, messageID, body, senderID } = event;
    
    // Ignore if no message text or if sent by the bot itself
    if (!body) return;

    // Detect URL in the message body
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const match = body.match(urlRegex);
    if (!match) return;

    const url = match[0];

    // Identify platform or direct link
    const isFB = /facebook\.com|fb\.watch/i.test(url);
    const isTikTok = /tiktok\.com/i.test(url);
    const isIG = /instagram\.com/i.test(url);
    const isYT = /youtube\.com|youtu\.be/i.test(url);
    const isTwitter = /twitter\.com|x\.com/i.test(url);
    const isThreads = /threads\.net/i.test(url);
    const isPinterest = /pinterest\.com|pin\.it/i.test(url);
    const isSnapchat = /snapchat\.com/i.test(url);
    const isVimeo = /vimeo\.com/i.test(url);
    const isDailymotion = /dailymotion\.com|dai\.ly/i.test(url);

    // Direct extensions
    const directExtensions = ["mp4", "mp3", "jpg", "jpeg", "png", "gif", "webp", "pdf", "zip", "txt"];
    let isDirectFile = false;
    let fileExtension = "";

    try {
      const parsed = new URL(url);
      const extMatch = parsed.pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (extMatch) {
        fileExtension = extMatch[1].toLowerCase();
        if (directExtensions.includes(fileExtension)) {
          isDirectFile = true;
        }
      }
    } catch (e) {
      // Non-critical parsing error
    }

    // If it's neither a direct file nor a supported social platform, ignore it
    if (!isDirectFile && !isFB && !isTikTok && !isIG && !isYT && !isTwitter && !isThreads && !isPinterest && !isSnapchat && !isVimeo && !isDailymotion) {
      return;
    }

    // Send processing loader message
    let loadingMessageID = null;
    try {
      const infoMsg = await new Promise((resolve) => {
        api.sendMessage(
          "╭───『 RIYAD BOT 』───╮\n" +
          "│ 📥 AutoLink Detected Link!\n" +
          "│ Fetching and processing media...\n" +
          "│ Please hold on tightly.\n" +
          "╰─────────────────────╯",
          threadID,
          (err, info) => {
            if (!err && info) resolve(info);
            else resolve(null);
          },
          messageID
        );
      });
      if (infoMsg) loadingMessageID = infoMsg.messageID;
    } catch (err) {
      console.error("Failed to send loading message:", err);
    }

    const cacheDir = path.join(process.cwd(), "cache");
    await fs.ensureDir(cacheDir);
    const tempFileName = `riyad_autolink_${Date.now()}`;
    const MAX_SIZE = 80 * 1024 * 1024; // 80MB limit

    // Helper function to safely delete temp files
    const safeDelete = async (filePath) => {
      try {
        if (filePath && await fs.exists(filePath)) {
          await fs.remove(filePath);
        }
      } catch (e) {
        console.error("Error during temp file deletion:", e);
      }
    };

    // Helper to unsend loader message
    const safeUnsend = (msgID) => {
      if (msgID) {
        try {
          api.unsendMessage(msgID);
        } catch (e) {
          // Gracefully fail
        }
      }
    };

    try {
      let downloadUrl = url;
      let forceType = "";

      // 1. Process social media platforms using free fallback public downloader APIs
      if (!isDirectFile) {
        let success = false;
        
        // List of reliable free public social media downloader gateways
        const apis = [
          `https://api.samir.xyz/download?url=${encodeURIComponent(url)}`,
          `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
          `https://aall.ironman.my.id/all?url=${encodeURIComponent(url)}`,
          `https://api.vyturex.com/downloader?url=${encodeURIComponent(url)}`
        ];

        for (const gatewayUrl of apis) {
          try {
            const res = await axios.get(gatewayUrl, { timeout: 12000 });

console.log("API:", gatewayUrl);
console.log(JSON.stringify(res.data, null, 2));

const data = res.data;

            // Handle standard response wrappers
            if (data && (data.status === true || data.success || data.url || data.result)) {
              const result = data.result || data;
              
              // Extract best download URL based on common gateway properties
              const potentialUrl = result.video || result.video_url || result.mp4 || result.nowatermark || result.no_watermark || result.hd || result.sd || result.url || (result.links && result.links[0] && result.links[0].url);
              
              if (potentialUrl) {
                downloadUrl = potentialUrl;
                if (result.title) forceType = result.title;
                success = true;
                break;
              }
            }
          } catch (err) {
            console.warn(`Gateway ${gatewayUrl} failed to process URL:`, err.message);
          }
        }

        // If no API gateway succeeded, fall back to direct file inspection
        if (!success) {
          console.log("No social media gateway succeeded. Falling back to direct stream check.");
        }
      }

      // 2. Fetch resource headers to determine content length and true extension
      let contentLength = 0;
      let contentType = "";
      try {
        const headRes = await axios.head(downloadUrl, { timeout: 8000 });
        contentLength = parseInt(headRes.headers['content-length'] || "0", 10);
        contentType = headRes.headers['content-type'] || "";
      } catch (headErr) {
        console.warn("HEAD check failed, continuing with GET fallback headers:", headErr.message);
      }

      if (contentLength > MAX_SIZE) {
        safeUnsend(loadingMessageID);
        return api.sendMessage(
          "╭───『 RIYAD BOT 』───╮\n" +
          "│ ⚠️ Limit Exceeded!\n" +
          `│ Detected file exceeds our 80MB size cap.\n` +
          `│ File size: ${(contentLength / (1024 * 1024)).toFixed(2)}MB.\n` +
          "╰─────────────────────╯",
          threadID,
          messageID
        );
      }

      // Detect file extension from content-type if missing or direct file
      if (!fileExtension) {
        if (contentType.includes("video/mp4")) fileExtension = "mp4";
        else if (contentType.includes("audio/mpeg") || contentType.includes("audio/mp3")) fileExtension = "mp3";
        else if (contentType.includes("image/jpeg")) fileExtension = "jpg";
        else if (contentType.includes("image/png")) fileExtension = "png";
        else if (contentType.includes("image/gif")) fileExtension = "gif";
        else if (contentType.includes("image/webp")) fileExtension = "webp";
        else if (contentType.includes("application/pdf")) fileExtension = "pdf";
        else if (contentType.includes("application/zip")) fileExtension = "zip";
        else if (contentType.includes("text/plain")) fileExtension = "txt";
        else if (contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) fileExtension = "docx";
        else fileExtension = "bin";
      }

      const tempFilePath = path.join(cacheDir, `${tempFileName}.${fileExtension}`);

      // 3. Initiate Stream Download
      const streamResponse = await axios({
  method: 'get',
  url: downloadUrl,
  responseType: 'stream',
  timeout: 45000
});

console.log("DOWNLOAD URL:", downloadUrl);
console.log("CONTENT TYPE:", streamResponse.headers["content-type"]);
console.log("CONTENT LENGTH:", streamResponse.headers["content-length"]);

      const getLength = parseInt(streamResponse.headers['content-length'] || "0", 10);
      if (getLength > MAX_SIZE) {
        safeUnsend(loadingMessageID);
        return api.sendMessage(
          "╭───『 RIYAD BOT 』───╮\n" +
          "│ ⚠️ Limit Exceeded!\n" +
          "│ Download aborted: File exceeds 80MB.\n" +
          "╰─────────────────────╯",
          threadID,
          messageID
        );
      }

      const writer = fs.createWriteStream(tempFilePath);
      streamResponse.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Confirm downloaded size
      const fileStats = await fs.stat(tempFilePath);
      if (fileStats.size === 0) {
        throw new Error("Empty media payload downloaded from link.");
      }

      // 4. Send attachment back to Messenger thread
      await new Promise((resolve, reject) => {
        api.sendMessage(
          {
            body:
`╭───『 RIYAD BOT 』───╮
│ 📥 Media Delivery Active
│ Platform: ${isDirectFile ? "Direct Link" : "Social Media"}
│ File Type: ${fileExtension.toUpperCase()}
╰─────────────────────╯`,
            attachment: fs.createReadStream(tempFilePath)
          },
          threadID,
          async (err) => {
            // Guarantee file cleanup immediately
            await safeDelete(tempFilePath);
            if (err) reject(err);
            else resolve(true);
          },
          messageID
        );
      });

      safeUnsend(loadingMessageID);

    } catch (err) {
      console.error("AutoLink processing failed:", err.message);
      safeUnsend(loadingMessageID);
      // Fail silently without posting annoying errors for regular text chatter that includes non-downloadable links
    }
  }
};
