"use strict";

const fs = require("fs");
const path = require("path");
const replyManager = require("../replies/replyManager");
const {
  search,
  getMediaById,
  resolveUrl,
  unwrapPinterestUrl,
} = require("../utils/riyadPinterestApi");
const { buildResultCollage } = require("../utils/resultCollage");
const {
  downloadPinterestMedia,
  sendFileWithRetry,
  removeFile,
} = require("../utils/mediaFile");

const PIN_LINK_RE = /https?:\/\/[^\s<>"']+/gi;
const RESULT_LIMIT = 10;

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

function mediaUrl(item) {
  return String(item?.videoUrl || item?.image || item?.thumbnail || "");
}

function isVideoResult(item) {
  return Boolean(
    item &&
      (item.isVideo ||
        item.videoUrl ||
        item.type === "video" ||
        /\.(mp4|m3u8|mov|m4v|webm|gif)(?:[?#].*)?$/i.test(mediaUrl(item))),
  );
}

function isGifResult(item) {
  return /\.gif(?:[?#].*)?$/i.test(mediaUrl(item));
}

function resultKey(item) {
  return String(item?.id || item?.pinUrl || item?.image || item?.thumbnail || "");
}

function keepOnlyRequestedMedia(results, mode) {
  const seen = new Set();
  const filtered = [];

  for (const item of results || []) {
    const key = resultKey(item);
    if (!key || seen.has(key)) continue;

    // "pin <query>" is intentionally image-only. GIFs are also left out of
    // the photo list; they can still be returned by "pin V <query>".
    const matches =
      mode === "video"
        ? isVideoResult(item)
        : !isVideoResult(item) && !isGifResult(item);
    if (!matches) continue;

    seen.add(key);
    filtered.push(item);
    if (filtered.length === RESULT_LIMIT) break;
  }

  return filtered;
}

async function searchMedia(query, mode) {
  const searchLimit = 25;
  const requestedType = mode === "video" ? "video" : "image";

  // The third argument is supported by the updated API helper. Older helpers
  // ignore it, so the local filter below still guarantees the command output
  // never mixes images and videos.
  let results = await search(query, searchLimit, { type: requestedType });
  let filtered = keepOnlyRequestedMedia(results, mode);

  // Search responses can contain too few items of one media type. One small
  // second pass asks Pinterest for a more specific query, then de-duplicates
  // the combined results while keeping the same 10-item limit.
  if (filtered.length < RESULT_LIMIT) {
    const focusedQuery =
      mode === "video" ? `${query} video` : `${query} photo`;
    try {
      const focused = await search(focusedQuery, searchLimit, {
        type: requestedType,
      });
      filtered = keepOnlyRequestedMedia(
        [...filtered, ...(focused || [])],
        mode,
      );
    } catch (_) {
      // Keep the first successful search result.
    }
  }

  return filtered.slice(0, RESULT_LIMIT);
}

async function sendMedia(api, media, threadID, messageID, cacheDir) {
  if (!media || (!media.image && !media.videoUrl)) {
    react(api, "❌", messageID);
    return api.sendMessage(
      "❌ এই Pinterest pin-এ কোনো media পাওয়া যায়নি।",
      threadID,
      messageID,
    );
  }

  const video = Boolean(media.isVideo || media.videoUrl);
  const filePath = path.join(
    cacheDir,
    `pin_${Date.now()}_${video ? "video.mp4" : "image.jpg"}`,
  );
  react(api, "⏳", messageID);

  try {
    await downloadPinterestMedia(media, filePath);
    const info = await sendFileWithRetry(api, {
      body: `✅ | ${media.title || "Pinterest"}${video ? " (video)" : " (HD image)"}`,
      filePath,
      threadID,
      messageID,
    });
    await removeFile(filePath);
    react(api, "✅", messageID);
    return info;
  } catch (error) {
    await removeFile(filePath);
    react(api, "❌", messageID);
    console.error("[PIN DOWNLOAD ERROR]", error.response?.data || error.message);
    return api.sendMessage(
      `❌ Pinterest download failed: ${error.message}`,
      threadID,
      messageID,
    );
  }
}

async function sendSearchResults(api, event, replyManagerInstance, results, mode) {
  const { threadID, messageID, senderID } = event;
  const cacheDir = path.join(__dirname, "cache");
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const collagePath = path.join(cacheDir, `pin_results_${Date.now()}.png`);
  const collage = await buildResultCollage(results, {
    variant: "pinterest",
    headerTitle: mode === "video" ? "PINTEREST VIDEOS" : "PINTEREST IMAGES",
  });
  await fs.promises.writeFile(collagePath, collage);

  const label = mode === "video" ? "video" : "image";
  const info = await sendFileWithRetry(api, {
    body: `📌 ${results.length}টি Pinterest ${label} result পাওয়া গেছে। Reply করে 1-${results.length} লিখুন।`,
    filePath: collagePath,
    threadID,
    messageID,
  });
  await removeFile(collagePath);

  if (info?.messageID && replyManagerInstance) {
    replyManagerInstance.set(info.messageID, {
      commandName: "pin",
      author: senderID,
      results,
    });
  }
  return info;
}

module.exports = {
  config: {
    name: "pin",
    aliases: ["pinterest", "pic"],
    version: "6.0.0",
    author: "Riyad",
    countDown: 10,
    role: 0,
    category: "image",
    shortDescription:
      "Search Pinterest images, or use pin V <query> for videos only",
    guide: {
      en: "{pn} <query> — images only; {pn} V <query> — videos only; reply 1-10",
    },
  },

  onStart: async function ({ api, event, args, replyManager: replyManagerInstance }) {
    const { threadID, messageID } = event;
    const rawArgs = [...args];
    const videoMode = String(rawArgs[0] || "").toLowerCase() === "v";
    if (videoMode) rawArgs.shift();

    const query = rawArgs.join(" ").trim();
    if (!query) {
      return api.sendMessage(
        videoMode
          ? "❌ V-এর পরে Pinterest video search query দিন।"
          : "❌ Pinterest image search query দিন।",
        threadID,
        messageID,
      );
    }

    const mode = videoMode ? "video" : "image";
    react(api, "⏳", messageID);
    try {
      const results = await searchMedia(query, mode);
      if (!results.length) {
        react(api, "❌", messageID);
        return api.sendMessage(
          mode === "video"
            ? "❌ এই query-তে কোনো Pinterest video পাওয়া যায়নি।"
            : "❌ এই query-তে কোনো Pinterest image পাওয়া যায়নি।",
          threadID,
          messageID,
        );
      }
      react(api, "✅", messageID);
      return await sendSearchResults(
        api,
        event,
        replyManagerInstance || replyManager,
        results,
        mode,
      );
    } catch (error) {
      react(api, "❌", messageID);
      const status = error.response?.status || error.status;
      if (status === 403 || /403|forbidden|blocked/i.test(error.message || "")) {
        return api.sendMessage(
          "❌ Pinterest search সাময়িকভাবে block করেছে। API-তে logged-in Pinterest cookies সেট করলে এই search-এর 403 কমবে।",
          threadID,
          messageID,
        );
      }
      return api.sendMessage(
        `❌ Pinterest search failed: ${error.message}`,
        threadID,
        messageID,
      );
    }
  },

  onReply: async function ({ api, event, Reply, replyData }) {
    const data = Reply || replyData || {};
    if (data.author && String(event.senderID) !== String(data.author)) return;
    const choice = Number.parseInt(String(event.body || "").trim(), 10);
    if (!Number.isInteger(choice) || choice < 1 || choice > data.results.length) {
      return api.sendMessage(
        `❌ 1-${data.results.length} এর মধ্যে একটি number reply দিন।`,
        event.threadID,
        event.messageID,
      );
    }

    const selected = data.results[choice - 1];
    const cacheDir = path.join(__dirname, "cache");
    await fs.promises.mkdir(cacheDir, { recursive: true });
    try {
      const media = await getMediaById(selected.id);
      return sendMedia(api, media, event.threadID, event.messageID, cacheDir);
    } catch (error) {
      react(api, "❌", event.messageID);
      return api.sendMessage(
        `❌ Pinterest media resolve failed: ${error.message}`,
        event.threadID,
        event.messageID,
      );
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
      return api.sendMessage(
        `❌ Pinterest link process করা যায়নি: ${error.message}`,
        event.threadID,
        event.messageID,
      );
    }
  },
};
