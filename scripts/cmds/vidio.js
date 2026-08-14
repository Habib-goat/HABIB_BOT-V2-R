/**
 * Riyad Bot Framework
 *
 * Search up to 10 videos via the user's own riyad-video-api, send ONE
 * numbered collage image, then download the selected video as mp4 after
 * a 1-10 reply.
 *
 * Supported: vidio <name/link> | video <name/link> | vid <name/link>
 */
"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const replyManager = require("../replies/replyManager");
const { search, resolveDownload } = require("../utils/riyadVideoApi");
const { buildResultCollage } = require("../utils/resultCollage");

// 🔒 Author verification — do not remove/rename
const OFFICIAL_AUTHOR = "Riyad";
function verifyAuthor(api, threadID, messageID) {
  if (module.exports.config.author !== OFFICIAL_AUTHOR) {
    api.sendMessage(
      "🚨 Credit modification detected! Please restore the original author ('Riyad') to run this command.",
      threadID,
      messageID
    );
    return false;
  }
  return true;
}

function react(api, emoji, messageID) {
  if (typeof api.setMessageReaction === "function") {
    api.setMessageReaction(emoji, messageID, () => {}, true);
  }
}

const YT_LINK_RE = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})(?:\S+)?$/;

async function downloadToFile(url, filePath, timeout = 60000) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout });
  fs.writeFileSync(filePath, res.data);
}

async function sendVideo(api, id, title, threadID, messageID, cacheDir) {
  const filePath = path.join(cacheDir, `vidio_${Date.now()}.mp4`);
  react(api, "⏳", messageID);
  try {
    const resolved = await resolveDownload(id, "mp4");
    await downloadToFile(resolved.downloadLink, filePath);
    react(api, "✅", messageID);
    return api.sendMessage(
      { body: `✅ | ${resolved.title || title}`, attachment: fs.createReadStream(filePath) },
      threadID,
      () => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      },
      messageID
    );
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    react(api, "❌", messageID);
    console.error("[VIDIO DOWNLOAD ERROR]", err.message);
    return api.sendMessage(`❌ Download failed: ${err.message}`, threadID, messageID);
  }
}

module.exports = {
  config: {
    name: "vidio",
    aliases: ["video", "vid"],
    version: "2.0.1",
    author: "Riyad",
    countDown: 10,
    role: 0,
    category: "media",
    shortDescription: "Search/download a YouTube video as mp4",
    guide: { en: "{pn} <name or link> — reply with 1-10 to download (name search only)" }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    if (!verifyAuthor(api, threadID, messageID)) return;

    const input = args.join(" ").trim();
    if (!input) {
      return api.sendMessage("❌ Usage: vidio <name or link>", threadID, messageID);
    }

    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });

    // Direct YouTube link — skip the search/collage step, download right away.
    const linkMatch = input.match(YT_LINK_RE);
    if (linkMatch) {
      return sendVideo(api, linkMatch[1], input, threadID, messageID, cacheDir);
    }

    react(api, "⏳", messageID);
    let collagePath;
    try {
      const results = await search(input);
      if (!results.length) {
        react(api, "❌", messageID);
        return api.sendMessage(`❌ "${input}" এর জন্য কোনো ফলাফল পাওয়া যায়নি।`, threadID, messageID);
      }

      const pngBuffer = await buildResultCollage(results);
      collagePath = path.join(cacheDir, `vidio_collage_${Date.now()}.png`);
      fs.writeFileSync(collagePath, pngBuffer);
      react(api, "✅", messageID);

      return api.sendMessage(
        {
          body: `🔎 | "${input}" এর জন্য ${results.length}টি ফলাফল\n\n👉 Reply with a number (1-${results.length}) to get the video.`,
          attachment: fs.createReadStream(collagePath)
        },
        threadID,
        (err, info) => {
          if (collagePath && fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
          if (!err && info?.messageID) {
            replyManager.set(info.messageID, {
              commandName: this.config.name,
              author: senderID,
              results,
              query: input
            });
          }
        },
        messageID
      );
    } catch (err) {
      if (collagePath && fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      react(api, "❌", messageID);
      console.error("[VIDIO ERROR]", err.message);
      return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
    }
  },

  onReply: async function ({ api, event, Reply }) {
    const { threadID, messageID, senderID } = event;
    if (String(senderID) !== String(Reply.author)) return;

    const choice = parseInt(String(event.body || "").trim(), 10);
    if (isNaN(choice) || choice < 1 || choice > Reply.results.length) {
      return api.sendMessage(`❌ Reply with a number between 1 and ${Reply.results.length}.`, threadID, messageID);
    }

    const selected = Reply.results[choice - 1];
    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    return sendVideo(api, selected.id, selected.title, threadID, messageID, cacheDir);
  }
};
