"use strict";

const fs = require("fs");
const path = require("path");
const replyManager = require("../replies/replyManager");
const {
  search,
  getMediaById,
  resolveUrl,
  unwrapPinterestUrl
} = require("../utils/riyadPinterestApi");
const { buildResultCollage } = require("../utils/resultCollage");
const {
  downloadPinterestMedia,
  sendFileWithRetry,
  removeFile
} = require("../utils/mediaFile");

const PIN_LINK_RE = /https?:\/\/[^\s<>"']+/gi;

function react(api, emoji, messageID) {
  if (typeof api.setMessageReaction === "function") {
    api.setMessageReaction(emoji, messageID, () => {}, true);
  }
}

function findPinterestUrl(text) {
  for (const candidate of String(text || "").match(PIN_LINK_RE) || []) {
    const url = unwrapPinterestUrl(candidate.replace(/[),.;!?]+$/, ""));
    if (/pin\.it\//i.test(url) || /pinterest\.[a-z.]+\/pin\//i.test(url)) {
      return url;
    }
  }
  return null;
}

async function sendMedia(api, media, threadID, messageID, cacheDir) {
  if (!media || (!media.image && !media.videoUrl)) {
    react(api, "❌", messageID);
    return api.sendMessage("❌ এই Pinterest pin-এ কোনো media পাওয়া যায়নি।", threadID, messageID);
  }

  const isVideo = Boolean(media.isVideo || media.videoUrl);
  const filePath = path.join(cacheDir, `pin_${Date.now()}_${isVideo ? "video.mp4" : "image.jpg"}`);
  react(api, "⏳", messageID);

  try {
    await downloadPinterestMedia(media, filePath);
    const info = await sendFileWithRetry(api, {
      body: `✅ | ${media.title || "Pinterest"}${isVideo ? " (video)" : " (HD image)"}`,
      filePath,
      threadID,
      messageID
    });
    await removeFile(filePath);
    react(api, "✅", messageID);
    return info;
  } catch (error) {
    await removeFile(filePath);
    react(api, "❌", messageID);
    console.error("[PIN DOWNLOAD ERROR]", error.response?.data || error.message);
    return api.sendMessage(`❌ Pinterest download failed: ${error.message}`, threadID, messageID);
  }
}

async function sendSearchResults(api, event, replyManagerInstance, results) {
  const { threadID, messageID, senderID } = event;
  const cacheDir = path.join(__dirname, "cache");
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const collagePath = path.join(cacheDir, `pin_results_${Date.now()}.png`);
  const collage = await buildResultCollage(results.map((item) => ({
    ...item,
    thumbnail: item.image || item.thumbnail
  })));
  await fs.promises.writeFile(collagePath, collage);

  const info = await sendFileWithRetry(api, {
    body: `📌 ${results.length}টি Pinterest result পাওয়া গেছে। Reply করে 1-${results.length} লিখুন।`,
    filePath: collagePath,
    threadID,
    messageID
  });
  await removeFile(collagePath);

  if (info?.messageID && replyManagerInstance) {
    replyManagerInstance.set(info.messageID, {
      commandName: "pin",
      author: senderID,
      results
    });
  }
  return info;
}

module.exports = {
  config: {
    name: "pin",
    aliases: ["pinterest", "pic"],
    version: "5.0.0",
    author: "Riyad",
    countDown: 10,
    role: 0,
    category: "image",
    shortDescription: "Search Pinterest images/videos or auto-download a Pinterest link",
    guide: { en: "{pn} <query> — reply 1-10, or paste a Pinterest link directly" }
  },

  onStart: async function ({ api, event, args, replyManager: replyManagerInstance }) {
    const { threadID, messageID } = event;
    const query = args.join(" ").trim();
    if (!query) return api.sendMessage("❌ Pinterest search query দিন।", threadID, messageID);

    react(api, "⏳", messageID);
    try {
      const results = await search(query, 10);
      if (!results.length) {
        react(api, "❌", messageID);
        return api.sendMessage("❌ কোনো Pinterest result পাওয়া যায়নি।", threadID, messageID);
      }
      react(api, "✅", messageID);
      return await sendSearchResults(api, event, replyManagerInstance || replyManager, results);
    } catch (error) {
      react(api, "❌", messageID);
      return api.sendMessage(`❌ Pinterest search failed: ${error.message}`, threadID, messageID);
    }
  },

  onReply: async function ({ api, event, Reply, replyData }) {
    const data = Reply || replyData || {};
    if (data.author && String(event.senderID) !== String(data.author)) return;
    const choice = Number.parseInt(String(event.body || "").trim(), 10);
    if (!Number.isInteger(choice) || choice < 1 || choice > data.results.length) {
      return api.sendMessage(`❌ 1-${data.results.length} এর মধ্যে একটি number reply দিন।`, event.threadID, event.messageID);
    }

    const selected = data.results[choice - 1];
    const cacheDir = path.join(__dirname, "cache");
    await fs.promises.mkdir(cacheDir, { recursive: true });
    try {
      const media = await getMediaById(selected.id);
      return sendMedia(api, media, event.threadID, event.messageID, cacheDir);
    } catch (error) {
      react(api, "❌", event.messageID);
      return api.sendMessage(`❌ Pinterest media resolve failed: ${error.message}`, event.threadID, event.messageID);
    }
  },

  onChat: async function ({ api, event }) {
    const url = findPinterestUrl(event.body);
    if (!url) return;

    const cacheDir = path.join(__dirname, "cache");
    await fs.promises.mkdir(cacheDir, { recursive: true });
    try {
      const media = await resolveUrl(url);
      return sendMedia(api, media, event.threadID, event.messageID, cacheDir);
    } catch (error) {
      react(api, "❌", event.messageID);
      console.error("[PIN AUTO-DOWNLOAD ERROR]", error.message);
      return api.sendMessage(`❌ Pinterest link process করা যায়নি: ${error.message}`, event.threadID, event.messageID);
    }
  }
};