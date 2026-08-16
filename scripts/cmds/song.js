/**
 * Riyad Bot Framework
 *
 * Search up to 10 songs via the user's own riyad-video-api, send ONE numbered
 * collage image, then download the selected song as mp3 after a 1-10 reply.
 *
 * Supported: sing <song name> | song <song name> | gan <song name>
 */
"use strict";

const fs = require("fs");
const path = require("path");
const replyManager = require("../replies/replyManager");
const { search, resolveDownload } = require("../utils/riyadVideoApi");
const { buildResultCollage } = require("../utils/resultCollage");
const {
  downloadToFile,
  resolveDownloadCached,
} = require("../utils/mediaDownload");

const OFFICIAL_AUTHOR = "Riyad";
function verifyAuthor(api, threadID, messageID) {
  if (module.exports.config.author !== OFFICIAL_AUTHOR) {
    api.sendMessage(
      "Credit modification detected! Please restore the original author ('Riyad') to run this command.",
      threadID,
      messageID,
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

module.exports = {
  config: {
    name: "song",
    aliases: ["song", "gan", "sing"],
    version: "4.1.0",
    author: "Riyad",
    countDown: 10,
    role: 0,
    category: "music",
    description: {
      en: "Search a song and download it as mp3 by replying with a number",
    },
    guide: { en: "{pn} <song name> — reply with 1-10 to download" },
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    if (!verifyAuthor(api, threadID, messageID)) return;

    const query = args.join(" ").trim();
    if (!query) {
      return api.sendMessage(
        "Usage: sing <song name>\nExample: sing shape of you",
        threadID,
        messageID,
      );
    }

    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    react(api, "⏳", messageID);

    let collagePath;
    try {
      const results = await search(query);
      if (!results.length) {
        react(api, "❌", messageID);
        return api.sendMessage(
          `"${query}" এর জন্য কোনো ফলাফল পাওয়া যায়নি।`,
          threadID,
          messageID,
        );
      }

      const pngBuffer = await buildResultCollage(results);
      collagePath = path.join(cacheDir, `sing_collage_${Date.now()}.png`);
      fs.writeFileSync(collagePath, pngBuffer);
      react(api, "✅", messageID);

      return api.sendMessage(
        {
          body: `🎵 | "${query}" এর জন্য ${results.length}টি ফলাফল\n\nReply with a number (1-${results.length}) to get the mp3.`,
          attachment: fs.createReadStream(collagePath),
        },
        threadID,
        (error, info) => {
          if (collagePath && fs.existsSync(collagePath)) {
            fs.unlinkSync(collagePath);
          }
          if (!error && info?.messageID) {
            replyManager.set(info.messageID, {
              commandName: this.config.name,
              author: senderID,
              results,
              query,
            });
          }
        },
        messageID,
      );
    } catch (error) {
      if (collagePath && fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      react(api, "❌", messageID);
      console.error("[SING ERROR]", error.message);
      return api.sendMessage(`Error: ${error.message}`, threadID, messageID);
    }
  },

  onReply: async function ({ api, event, Reply }) {
    const { threadID, messageID, senderID } = event;
    if (String(senderID) !== String(Reply.author)) return;

    const choice = Number.parseInt(String(event.body || "").trim(), 10);
    if (
      !Number.isInteger(choice) ||
      choice < 1 ||
      choice > Reply.results.length
    ) {
      return api.sendMessage(
        `Reply with a number between 1 and ${Reply.results.length}.`,
        threadID,
        messageID,
      );
    }

    const selected = Reply.results[choice - 1];
    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `sing_${Date.now()}.mp3`);
    react(api, "⏳", messageID);

    try {
      const resolved = await resolveDownloadCached(
        resolveDownload,
        selected.id,
        "mp3",
      );
      await downloadToFile(resolved.downloadLink, filePath);
      react(api, "✅", messageID);

      return api.sendMessage(
        {
          body: `✅ | ${resolved.title || selected.title}`,
          attachment: fs.createReadStream(filePath),
        },
        threadID,
        () => {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        },
        messageID,
      );
    } catch (error) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      react(api, "❌", messageID);
      console.error("[SING DOWNLOAD ERROR]", error.message);
      return api.sendMessage(
        `Download failed: ${error.message}`,
        threadID,
        messageID,
      );
    }
  },
};
