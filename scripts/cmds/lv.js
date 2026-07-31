const axios = require("axios");
const fs = require("fs");
const path = require("path");

// 🔒 Author verification function
const OFFICIAL_AUTHOR = "✨ 𝐇𝐀𝐒𝐀𝐍 ✨";

function verifyCredits(author) {
  if (author !== OFFICIAL_AUTHOR) {
    throw new Error("🚨 Credit modification detected! Please restore original credits to run this command.");
  }
}

// 🔎 Primary API Search
async function fetchPrimary(query) {
  try {
    const res = await axios.get(
      `https://lyric-search-neon.vercel.app/kshitiz?keyword=${encodeURIComponent(query)}`
    );
    if (res.data && res.data.length > 0 && res.data[0].videoUrl) {
      return {
        title: res.data[0].title,
        videoUrl: res.data[0].videoUrl
      };
    }
  } catch (e) {}
  return null;
}

// 🔄 Backup API Search
async function fetchBackup(query) {
  try {
    const res = await axios.get(
      `https://raw-video-api.vercel.app/search?q=${encodeURIComponent(query)}`
    );
    if (res.data && res.data.url) {
      return {
        title: res.data.title || query,
        videoUrl: res.data.url
      };
    }
  } catch (e) {}
  return null;
}

// 🎶 Clean Song Title Function
function cleanTitle(text = "") {
  return text
    .replace(/#\S+/g, "")        // #hashtag বাদ
    .replace(/@\S+/g, "")        // @username বাদ
    .replace(/\(.*?\)/g, "")     // (bracket text) বাদ
    .replace(/\[.*?\]/g, "")     // [bracket text] বাদ
    .replace(/official|video|lyrics|lyric|audio|full song|4k|hd|status/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  config: {
    name: "lv",
    aliases: ["lyricvideo", "lyricsvideo"],
    version: "4.5.0",
    author: "✨ 𝐇𝐀𝐒𝐀𝐍 ✨",
    countDown: 5,
    role: 0,
    category: "fun",
    description: { en: "High reliability lyric video player with fallback API" },
    guide: { en: "{pn} <song name / reply to audio or video>" }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, messageReply } = event;

    try {
      // 🛡️ Anti-Credit Edit Protection Check
      verifyCredits(module.exports.config.author);

      let query = "";

      // 🎵 Reply Audio/Video check
      if (messageReply && messageReply.attachments && messageReply.attachments.length > 0) {
        const att = messageReply.attachments[0];

        if (att.type === "audio" || att.type === "video") {
          const res = await axios.get(
            `https://audio-reco.onrender.com/kshitiz?url=${encodeURIComponent(att.url)}`
          );

          query = cleanTitle(res.data?.title || "");
        }
      }
      // 🔎 Search by text input
      else if (args.length > 0) {
        query = args.join(" ");
      }
      // ⚠️ কোনো গানের নাম বা অডিও না দিলে
      else {
        return api.sendMessage("🦁 𝐏𝐥𝐞𝐚𝐬𝐞 𝐩𝐫𝐨𝐯𝐢𝐝𝐞 𝐚 𝐬𝐨𝐧𝐠 𝐧𝐚𝐦𝐞!", threadID, messageID);
      }

      if (!query) {
        return api.sendMessage("🦁 𝐏𝐥𝐞𝐚𝐬𝐞 𝐩𝐫𝐨𝐯𝐢𝐝𝐞 𝐚 𝐬𝐨𝐧𝐠 𝐧𝐚𝐦𝐞!", threadID, messageID);
      }

      if (typeof api.setMessageReaction === "function") {
        api.setMessageReaction("🎵", messageID, () => {}, true);
      }

      const searchKeyword = cleanTitle(query);
      const finalQuery = `${searchKeyword} lyrics video`;

      // 🚀 ১ম API দিয়ে ট্রাই করবে
      let videoData = await fetchPrimary(finalQuery);

      // 🔄 যদি ১ম টা ফেল করে, ব্যাকআপ API দিয়ে ট্রাই করবে
      if (!videoData) {
        videoData = await fetchBackup(finalQuery);
      }

      // ❌ কোনো API-তেই গান না পেলে ওয়ার্নিং মেসেজ দেবে
      if (!videoData || !videoData.videoUrl) {
        return api.sendMessage("🦁 𝐒𝐨𝐫𝐫𝐲, 𝐧𝐨 𝐯𝐢𝐝𝐞𝐨 𝐟𝐨𝐮𝐧𝐝 𝐟𝐨𝐫 𝐭𝐡𝐢𝐬 𝐬𝐨𝐧𝐠!", threadID, messageID);
      }

      const videoUrl = videoData.videoUrl;
      const cleanSongName = cleanTitle(videoData.title || searchKeyword);

      // 📥 Download to local cache then stream as attachment
      const cacheDir = path.join(__dirname, "cache");
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const filePath = path.join(cacheDir, `lv_${Date.now()}.mp4`);

      const response = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "arraybuffer",
        timeout: 30000
      });
      fs.writeFileSync(filePath, response.data);

      // 🦁 ক্লিন ক্যাপশন
      const caption = `🦁 𝐋𝐘𝐑𝐈𝐂 𝐕𝐈𝐃𝐄𝐎 🦁\n\n🎵 ${cleanSongName}\n✨ 𝐄𝐧𝐣𝐨𝐲 𝐘𝐨𝐮𝐫 𝐌𝐮𝐬𝐢𝐜`;

      // 🎶 Send video attachment, then clean up cache file
      return api.sendMessage(
        {
          body: caption,
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        () => {
          fs.unlink(filePath, () => {});
        },
        messageID
      );

    } catch (err) {
      // 🛑 ক্রেডিট চেঞ্জ করলে এটি মেসেজ হিসেবে ইউজারকে জানিয়ে দেবে
      if (err.message.includes("Credit modification detected")) {
        return api.sendMessage("⚠️ 𝐓𝐡𝐢𝐬 𝐜𝐨𝐦𝐦𝐚𝐧𝐝 𝐡𝐚𝐬 𝐛𝐞𝐞𝐧 𝐭𝐚𝐦𝐩𝐞𝐫𝐞𝐝! 𝐎𝐫𝐢𝐠𝐢𝐧𝐚𝐥 𝐜𝐫𝐞𝐝𝐢𝐭𝐬 𝐦𝐮𝐬𝐭 𝐛𝐞 '✨ 𝐇𝐀𝐒𝐀𝐍 ✨'", threadID, messageID);
      }

      console.error("LV Command Error:", err);
      return api.sendMessage("𝐀𝐧 𝐞𝐫𝐫𝐨𝐫 𝐨𝐜𝐜𝐮𝐫𝐫𝐞𝐝 𝐰𝐡𝐢𝐥𝐞 𝐟𝐞𝐭𝐜𝐡𝐢𝐧𝐠 𝐭𝐡𝐞 𝐯𝐢𝐝𝐞𝐨!", threadID, messageID);
    }
  }
};
