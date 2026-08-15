/**
 * instavideo.js
 * -------------
 * Usage: instavideo <Instagram profile URL>
 *
 * Fetches the video/reel posts of a public Instagram profile (via the
 * companion Render API) and lists them 12 at a time. Reply "next" to
 * the bot's list message to see the next 12.
 *
 * Does NOT touch any other bot file, does NOT use onCall/onMessage/
 * adapter/database.get()/database.set() - only onStart + onChat with
 * api.sendMessage(), per the existing framework's conventions.
 *
 * Requires env var (or hard-coded fallback below):
 *   INSTAGRAM_API_URL=https://YOUR-RENDER-APP.onrender.com
 */

const axios = require("axios");

const API_URL = process.env.INSTAGRAM_API_URL || "https://YOUR-RENDER-APP.onrender.com";
const PAGE_SIZE = 12;
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

// messageID (of the bot's own list message) -> pagination session
// In-memory only - resets on bot restart, which is expected/acceptable.
const sessions = new Map();

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(key);
  }
}

function extractUsername(url) {
  if (!url) return null;
  const match = url
    .trim()
    .match(/^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?(?:\?.*)?$/i);
  if (!match) return null;
  const username = match[1].toLowerCase();
  const reserved = ["p", "reel", "reels", "stories", "explore", "accounts", "tv"];
  if (reserved.includes(username)) return null;
  return match[1];
}

function formatPage(videos, offset, total, username) {
  const page = videos.slice(offset, offset + PAGE_SIZE);
  const lines = page.map((v, i) => `${String(offset + i + 1).padStart(2, "0")}. ${v.url}`);

  const shown = Math.min(offset + PAGE_SIZE, total);
  const hasMore = shown < total;

  let msg =
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎬 VIDEO — @${username}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    lines.join("\n") +
    `\n\n━━━━━━━━━━━━━━━━━━\n` +
    `📊 Showing ${offset + 1}-${shown} of ${total}\n`;

  if (hasMore) {
    msg += `↩️ এই মেসেজে reply দিয়ে "next" লিখলে পরের ${Math.min(PAGE_SIZE, total - shown)}টা দেখাবে।`;
  } else {
    msg += `✅ সব ভিডিও দেখানো শেষ।`;
  }

  return msg;
}

module.exports = {
  config: {
    name: "instavideo",
    aliases: ["ivideo"],
    version: "1.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    shortDescription: "Instagram profile-এর video/reel লিংক দেখায়",
    longDescription: "Public Instagram profile-এর সব video/reel পোস্টের লিংক সংগ্রহ করে ১২টা করে দেখায়। Reply-তে 'next' লিখলে পরের ব্যাচ দেখাবে.",
    category: "media",
    guide: "{pn} <instagram profile url>"
  },

  onStart: async function ({ api, event, args }) {
    const threadID = event.threadID;
    const profileUrl = args[0];

    if (!profileUrl) {
      return api.sendMessage("❌ Instagram profile link দাও।\nউদাহরণ: instavideo https://www.instagram.com/username/", threadID, event.messageID);
    }

    const username = extractUsername(profileUrl);
    if (!username) {
      return api.sendMessage("❌ Please provide a valid Instagram profile URL.", threadID, event.messageID);
    }

    let statusMsgID = null;
    try {
      const statusInfo = await api.sendMessage("⏳ Instagram profile scanning...", threadID);
      statusMsgID = statusInfo && statusInfo.messageID;
    } catch (e) {
      // non-fatal, continue without the status message
    }

    let response;
    try {
      response = await axios.get(`${API_URL}/instagram/videos`, {
        params: { url: `https://www.instagram.com/${username}/` },
        timeout: 120000
      });
    } catch (err) {
      const status = err.response && err.response.status;
      const apiMsg = err.response && err.response.data && err.response.data.error;

      let userMsg = "⚠️ Instagram API তে সমস্যা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করো।";
      if (status === 403) userMsg = "🔒 এই প্রোফাইলটা private, শুধু public profile সাপোর্ট করা হয়।";
      else if (status === 404) userMsg = "❌ এই নামে কোনো Instagram profile পাওয়া যায়নি।";
      else if (status === 429) userMsg = "⚠️ Instagram বর্তমানে request block করছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
      else if (err.code === "ECONNABORTED") userMsg = "⌛ Request timeout হয়ে গেছে (Render server slow start হতে পারে), আবার চেষ্টা করো।";
      else if (apiMsg) userMsg = `❌ ${apiMsg}`;

      return api.sendMessage(userMsg, threadID, event.messageID);
    }

    const data = response.data;
    const videos = (data && data.videos) || [];

    if (videos.length === 0) {
      return api.sendMessage("📭 এই profile-এ কোনো public video/reel পাওয়া যায়নি।", threadID, event.messageID);
    }

    cleanupExpiredSessions();

    const pageText = formatPage(videos, 0, videos.length, username);

    let sent;
    try {
      sent = await api.sendMessage(pageText, threadID);
    } catch (e) {
      return;
    }

    const listMsgID = sent && sent.messageID;
    if (listMsgID) {
      sessions.set(listMsgID, {
        username,
        videos,
        offset: PAGE_SIZE,
        threadID,
        requesterID: event.senderID,
        createdAt: Date.now()
      });
    }
  },

  onChat: async function ({ api, event }) {
    if (event.type !== "message_reply") return;
    if (!event.body) return;
    if (!/^next$/i.test(event.body.trim())) return;

    const replyToID = event.messageReply && event.messageReply.messageID;
    if (!replyToID) return;

    const session = sessions.get(replyToID);
    if (!session) return; // not a reply to one of our list messages

    if (session.offset >= session.videos.length) {
      return api.sendMessage("✅ সব ভিডিও দেখানো শেষ, আর নেই।", event.threadID, event.messageID);
    }

    const pageText = formatPage(session.videos, session.offset, session.videos.length, session.username);

    let sent;
    try {
      sent = await api.sendMessage(pageText, event.threadID);
    } catch (e) {
      return;
    }

    sessions.delete(replyToID);

    const newOffset = session.offset + PAGE_SIZE;
    const newListMsgID = sent && sent.messageID;
    if (newListMsgID) {
      sessions.set(newListMsgID, {
        ...session,
        offset: newOffset,
        createdAt: Date.now()
      });
    }
  }
};
