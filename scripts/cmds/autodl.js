const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

// ================= PLATFORM DETECT =================
function detectPlatform(url) {
  const urlLower = url.toLowerCase();
  if (urlLower.includes("tiktok.com")) return "𝙏𝙞𝙠𝙏𝙤𝙠";
  if (urlLower.includes("facebook.com") || urlLower.includes("fb.watch") || urlLower.includes("fb.com") || urlLower.includes("facebook.share")) return "𝙁𝙖𝙘𝙚𝙗𝙤𝙤𝙠";
  if (urlLower.includes("instagram.com") || urlLower.includes("instagr.am")) return "𝙄𝙣𝙨𝙩𝙖𝙜𝙧𝙖𝙢";
  if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) return "𝙔𝙤𝙪𝙏𝙪𝙗𝙚";
  if (urlLower.includes("x.com") || urlLower.includes("twitter.com")) return "𝙏𝙬𝙞𝙩𝙩𝙚𝙧 / 𝙓";
  if (urlLower.includes("pin.it") || urlLower.includes("pinterest.com")) return "𝙋𝙞𝙣𝙩𝙚𝙧𝙚𝙨𝙩";
  if (urlLower.includes("threads.net")) return "𝙏𝙝𝙧𝙚𝙖𝙙𝙨";
  if (urlLower.includes("snapchat.com")) return "𝙎𝙣𝙖𝙥𝙘𝙝𝙖𝙩";
  if (urlLower.includes("vimeo.com")) return "𝙑𝙞𝙢𝙚𝙤";
  if (urlLower.includes("dailymotion.com") || urlLower.includes("dai.ly")) return "𝘿𝙖𝙞𝙡𝙮𝙢𝙤𝙩𝙞𝙤𝙣";
  if (urlLower.includes("spotify.com")) return "𝙎𝙥𝙤𝙩𝙞𝙛𝙮";
  if (urlLower.includes("soundcloud.com")) return "𝙎𝙤𝙪𝙣𝙙𝘾𝙡𝙤𝙪𝙙";
  if (urlLower.includes("reddit.com")) return "𝙍𝙚𝙙𝙙𝙞𝙩";
  if (urlLower.includes("linkedin.com")) return "𝙇𝙞𝙣𝙠𝙚𝙙𝙄𝙣";
  if (urlLower.includes("capcut.com")) return "𝘾𝙖𝙥𝘾𝙪𝙩";
  if (urlLower.includes("kuaishou.com") || urlLower.includes("kwai.com")) return "𝙆𝙬𝙖𝙞 / 𝙆𝙪𝙖𝙞𝙨𝙝𝙤𝙪";
  if (urlLower.includes("douyin.com")) return "𝘿𝙤𝙪𝙮𝙞𝙣";
  if (urlLower.includes("bsky.app")) return "𝘽𝙡𝙪𝙚𝙨𝙠𝙮";
  if (urlLower.includes("tumblr.com")) return "𝙏𝙪𝙢𝙗𝙡𝙧";

  // Check direct file extensions
  const directExtensions = [".mp4", ".mp3", ".wav", ".m4a", ".mov", ".gif", ".png", ".jpg", ".jpeg", ".pdf", ".zip", ".docx", ".txt"];
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    if (directExtensions.some(ext => pathname.endsWith(ext) || urlLower.endsWith(ext))) {
      return "𝘿𝙞𝙧𝙚𝙘𝙩 𝙇𝙞𝙣𝙠";
    }
  } catch (e) {
    if (directExtensions.some(ext => urlLower.endsWith(ext))) {
      return "𝘿𝙞𝙧𝙚𝙘𝙩 𝙇𝙞𝙣𝙠";
    }
  }

  return "𝙐𝙣𝙠𝙣𝙤𝙬𝙣";
}

// ================= VIDEO EXTRACT =================
function extractVideo(data) {
  if (!data) return null;
  const r = data.result || {};
  return (
    r.high_quality ||
    r.video ||
    r.url ||
    data.high_quality ||
    data.video ||
    data.url ||
    null
  );
}

// ================= SUPPORTED DOMAIN ONLY CHECK (strict) =================
function isSupportedDomain(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase();

  const domains = [
    "tiktok.com", "fb.watch", "facebook.com", "fb.com", "instagram.com", "instagr.am",
    "youtube.com", "youtu.be", "x.com", "twitter.com", "pin.it", "pinterest.com",
    "threads.net", "snapchat.com", "vimeo.com", "dailymotion.com", "dai.ly",
    "spotify.com", "soundcloud.com", "reddit.com", "linkedin.com", "capcut.com",
    "kuaishou.com", "kwai.com", "douyin.com", "bsky.app", "tumblr.com"
  ];

  return domains.some(domain => urlLower.includes(domain));
}

// ================= MEDIA TYPE & EXTENSION RESOLUTION =================
function getFileInfo(contentType, url) {
  let ext = "bin";
  let typeLabel = "Document";

  contentType = (contentType || "").toLowerCase();
  const urlLower = (url || "").toLowerCase();

  let urlExt = "";
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
    if (lastPart.includes('.')) {
      urlExt = lastPart.substring(lastPart.lastIndexOf('.') + 1);
    }
  } catch (e) {
    // Ignore invalid url parse
  }

  if (contentType.includes("video/mp4")) {
    ext = "mp4";
    typeLabel = "Video";
  } else if (contentType.includes("video/")) {
    ext = urlExt || "mp4";
    typeLabel = "Video";
  } else if (contentType.includes("image/gif")) {
    ext = "gif";
    typeLabel = "GIF";
  } else if (contentType.includes("image/")) {
    ext = contentType.includes("png") ? "png" : "jpg";
    typeLabel = "Photo";
  } else if (contentType.includes("audio/")) {
    ext = contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : (urlExt || "m4a");
    typeLabel = "Audio";
  } else if (contentType.includes("application/pdf")) {
    ext = "pdf";
    typeLabel = "PDF";
  } else if (contentType.includes("application/zip") || contentType.includes("application/x-zip-compressed")) {
    ext = "zip";
    typeLabel = "ZIP";
  } else if (contentType.includes("application/") || contentType.includes("text/")) {
    if (urlExt) {
      ext = urlExt;
      if (["docx", "doc", "txt", "xlsx", "xls", "pptx", "ppt"].includes(urlExt)) {
        typeLabel = "Document";
      } else if (urlExt === "pdf") {
        typeLabel = "PDF";
      } else if (urlExt === "zip") {
        typeLabel = "ZIP";
      } else if (["mp3", "wav", "m4a", "ogg"].includes(urlExt)) {
        typeLabel = "Audio";
      } else if (["mp4", "mkv", "mov", "avi"].includes(urlExt)) {
        typeLabel = "Video";
      } else if (["jpg", "jpeg", "png", "webp"].includes(urlExt)) {
        typeLabel = "Photo";
      } else if (urlExt === "gif") {
        typeLabel = "GIF";
      }
    } else {
      ext = "bin";
      typeLabel = "Document";
    }
  } else {
    if (urlExt) {
      ext = urlExt;
      if (["mp4", "mkv", "mov", "avi", "webm"].includes(urlExt)) {
        typeLabel = "Video";
      } else if (["jpg", "jpeg", "png", "webp"].includes(urlExt)) {
        typeLabel = "Photo";
      } else if (urlExt === "gif") {
        typeLabel = "GIF";
      } else if (["mp3", "wav", "m4a", "ogg"].includes(urlExt)) {
        typeLabel = "Audio";
      } else if (urlExt === "pdf") {
        typeLabel = "PDF";
      } else if (urlExt === "zip") {
        typeLabel = "ZIP";
      } else {
        typeLabel = "Document";
      }
    } else {
      ext = "bin";
      typeLabel = "Document";
    }
  }

  return { ext, typeLabel };
}

// ================= FILE SIZE FORMATTER =================
function formatSize(bytes) {
  if (!bytes) return "Unknown";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

module.exports = {
  config: {
    name: "autodl",
    aliases: ["fb", "tiktok", "ig", "yt", "alldl", "dl", "download"],
    version: "1.1.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "media"
  },

  onStart: async function({ api, event }) {
    return api.sendMessage(
      "🤖 Auto-Download Bot is active!\n\nJust send any supported media link directly in the chat, and I will download it for you automatically without any commands or prefix!\n\nSupported Platforms:\n• TikTok\n• YouTube / Shorts\n• Facebook / FB Watch\n• Instagram / Reels\n• Twitter (X)\n• Threads\n• Snapchat\n• Pinterest\n• Spotify\n• SoundCloud\n• Reddit\n• LinkedIn\n• CapCut\n• Dailymotion\n• Kwai / Kuaishou\n• Douyin\n• Bluesky\n• Tumblr\n• Vimeo\n• Direct file links",
      event.threadID,
      event.messageID
    );
  },

  onChat: async function({ api, event }) {
    const text = event.body || "";
    if (!text.includes("http")) return;

    // Extract links
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    if (!matches) return;

    // Find the first link that matches our supported domains ONLY
    // (strict domain check — no more matching random links by file extension)
    let finalUrl = null;
    for (const match of matches) {
      if (isSupportedDomain(match)) {
        finalUrl = match;
        break;
      }
    }

    if (!finalUrl) {
      // Unsupported / unknown link — react with ❓ and do nothing else
      api.setMessageReaction("❓", event.messageID, () => {}, true);
      return;
    }

    // Supported link accepted — react with 🔥 and start processing
    api.setMessageReaction("🔥", event.messageID, () => {}, true);
    const startTime = Date.now();

    let loadingMessageID = null;
    let filePath = null;

    try {
      // 1. Send Beautiful Loading Message
      const loadingInfo = await new Promise((resolve) => {
        api.sendMessage(
          "🔄 Detecting Link...\n📥 Fetching Media...\n⚡ Downloading...\n\nPlease Wait...",
          event.threadID,
          (err, info) => {
            if (err) resolve(null);
            else resolve(info);
          },
          event.messageID
        );
      });

      if (loadingInfo && loadingInfo.messageID) {
        loadingMessageID = loadingInfo.messageID;
      }

      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);

      let downloadUrl = null;
      let info = { title: "Direct File", author: "Direct Link" };
      let isDirect = false;

      // Detect direct file link
      const urlLower = finalUrl.toLowerCase();
      const directExtensions = [".mp4", ".mp3", ".wav", ".m4a", ".mov", ".gif", ".png", ".jpg", ".jpeg", ".pdf", ".zip", ".docx", ".txt"];
      try {
        const parsed = new URL(finalUrl);
        const pathname = parsed.pathname.toLowerCase();
        if (directExtensions.some(ext => pathname.endsWith(ext) || urlLower.endsWith(ext))) {
          isDirect = true;
        }
      } catch (e) {
        if (directExtensions.some(ext => urlLower.endsWith(ext))) {
          isDirect = true;
        }
      }

      if (isDirect) {
        downloadUrl = finalUrl;
        try {
          const parsed = new URL(finalUrl);
          const pathname = parsed.pathname;
          const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
          info.title = decodeURIComponent(lastPart) || "Direct File";
        } catch (e) {
          info.title = "Direct File";
        }
      } else {
        // Retrieve download url from downloader API
        const res = await axios.get(
          "https://toshiro-editz-api.vercel.app/downloader/alldl?url=" +
            encodeURIComponent(finalUrl),
          { timeout: 30000 }
        );

        const data = res.data;
        downloadUrl = extractVideo(data);
        console.log("Download URL:", downloadUrl);
        console.log("API Response:", JSON.stringify(data, null, 2));
        const resultInfo = data.result || data;
        if (resultInfo) {
          info = {
            title: resultInfo.title || "Unknown",
            author: resultInfo.author || "Unknown"
          };
        }
      }

      if (!downloadUrl) {
        throw new Error("Media stream not found or unsupported link format.");
      }

      // Download content
      const response = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        timeout: 45000
      });

      const buffer = response.data;
      const contentType = response.headers["content-type"] || "";
      const sizeInBytes = response.headers["content-length"]
        ? parseInt(response.headers["content-length"], 10)
        : buffer.length;

      let fileInfo = getFileInfo(contentType, downloadUrl || finalUrl);

      // Instagram video fix
      if (
        detectPlatform(finalUrl) === "𝙄𝙣𝙨𝙩𝙖𝙜𝙧𝙖𝙢" &&
        fileInfo.typeLabel === "Document"
      ) {
        fileInfo.ext = "mp4";
        fileInfo.typeLabel = "Video";
      }

      filePath = path.join(cacheDir, `autodl_${Date.now()}.${fileInfo.ext}`);

      await fs.writeFile(filePath, Buffer.from(buffer));

      // Remove loading message
      if (loadingMessageID) {
        try {
          api.unsendMessage(loadingMessageID);
        } catch (e) {
          console.error("Unsend failed:", e);
        }
        loadingMessageID = null;
      }

      api.setMessageReaction("✅", event.messageID, () => {}, true);

      const platform = detectPlatform(finalUrl);
      const speed = ((Date.now() - startTime) / 1000).toFixed(2);

      // Build Beautiful Premium Messenger Message Layout
      const formattedMsg = `✦❰━━『 𝗥𝗜𝗬𝗔𝗗⚡𝗕𝗢𝗧 』━━❱✦
🎵 𝗧𝗶𝘁𝗹𝗲   › ${info.title}
🌍 𝗦𝗼𝘂𝗿𝗰𝗲  › ${platform}
👤 𝗔𝘂𝘁𝗵𝗼𝗿  › ${info.author}
📂 𝗧𝘆𝗽𝗲    › ${fileInfo.typeLabel}
📦 𝗦𝗶𝘇𝗲    › ${formatSize(sizeInBytes)}
⚡ 𝗦𝗽𝗲𝗲𝗱   › ${speed}s
❰✦✅𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲✅✦❱`;

      // Send the completed message with the attachment
      let isCleanedUp = false;
      const cleanupFile = () => {
        if (!isCleanedUp) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {
            console.error("Cleanup error:", e);
          }
          isCleanedUp = true;
        }
      };

      api.sendMessage(
        {
          body: formattedMsg,
          attachment: fs.createReadStream(filePath)
        },
        event.threadID,
        (err) => {
          cleanupFile();
        },
        event.messageID
      );

    } catch (err) {
      console.error("AutoDL Error:", err);

      // Remove loading message on failure
      if (loadingMessageID) {
        try {
          api.unsendMessage(loadingMessageID);
        } catch (e) {
          console.error("Unsend failed:", e);
        }
      }

      api.setMessageReaction("❌", event.messageID, () => {}, true);

      const errorMsg = `╭━━━〔 ❌ DOWNLOAD FAILED 〕━━━╮
┃ 📌 Error : ${err.message || "Unknown error occurred"}
┃ 🌍 URL   : ${finalUrl}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
🤖 Powered By RIYAD BOT`;

      api.sendMessage(errorMsg, event.threadID, event.messageID);

      // Ensure cleanup in catch block
      if (filePath) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.error("Failed to delete temp file:", e);
        }
      }
    }
  }
};
