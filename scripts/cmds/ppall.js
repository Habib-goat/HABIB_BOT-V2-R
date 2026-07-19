const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports = {
  config: {
    name: "ppall",
    version: "2.1.0",
    author: "Riyad (Optimized)",
    countDown: 5,
    role: 0,
    shortDescription: "View profile pictures of everyone in the group chat. 👥",
    longDescription: "Download and view high-resolution avatar photos for all chat participants, or targeted users, with admin restrictions.",
    category: "media",
    guide: "{pn} [all / @mentions / user_uids]"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID, mentions, participantIDs, type, messageReply } = event;
    const cacheDir = path.join(__dirname, "cache");

    const ADMIN_IDS = ["100012596826153", "61574930690578"];
    const normalizedSenderID = String(senderID || "").trim();
    
    if (!ADMIN_IDS.includes(normalizedSenderID)) {
      return api.sendMessage(
        `⚠️ Access Denied: This command is restricted to the authorized bot administrators. Your Sender ID (${normalizedSenderID}) is unauthorized.`,
        threadID,
        messageID
      );
    }

    try {
      await fs.ensureDir(cacheDir);

      let uids = [];

      if (type === "message_reply" && messageReply) {
        uids.push(messageReply.senderID);
      } 
      else if (mentions && Object.keys(mentions).length > 0) {
        uids = Object.keys(mentions);
      } 
      else if (args.length > 0) {
        if (["all", "everyone", "ppall", "@all", "@everyone"].includes(args[0].toLowerCase())) {
          uids = participantIDs || [];
          if (uids.length === 0) {
            try {
              const threadInfo = await api.getThreadInfo(threadID);
              uids = threadInfo?.participantIDs || [];
            } catch (e) {}
          }
        } else {
          uids = args.filter(arg => /^\d+$/.test(arg));
        }
      } 
      else {
        uids = participantIDs || [];
        if (uids.length === 0) {
          try {
            const threadInfo = await api.getThreadInfo(threadID);
            uids = threadInfo?.participantIDs || [];
          } catch (e) {}
        }
      }

      uids = [...new Set(uids)].filter(id => id && id !== "0" && id !== "1");

      if (uids.length === 0) {
        return api.sendMessage("⚠️ No valid member Facebook IDs were resolved.", threadID, messageID);
      }

      api.sendMessage(
  `📸 [ppall] Downloading ${uids.length} profile pictures in high-res. Please wait...`,
  threadID,
  messageID
);

      const tempFiles = [];
      const attachments = [];

      const downloadPromises = uids.map(async (uid) => {
        const cachePath = path.join(cacheDir, `ppall_${uid}_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`);
        const imageUrl = `https://graph.facebook.com/${uid}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
        
        try {
          const response = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 8000 });
          await fs.writeFile(cachePath, response.data);
          attachments.push(fs.createReadStream(cachePath));
          tempFiles.push(cachePath);
        } catch (e) {
          console.error(`Failed to download pp for user ID \${uid}: `, e.message);
        }
      });

      await Promise.all(downloadPromises);

      if (attachments.length === 0) {
        return api.sendMessage("❌ Failed to download any of the target avatars.", threadID, messageID);
      }

      const chunkSize = 5;
      for (let i = 0; i < attachments.length; i += chunkSize) {
        const chunk = attachments.slice(i, i + chunkSize);
        await api.sendMessage(
  {
    body: `🌟 𝗚𝗿𝗼𝘂𝗽 𝗣𝗿𝗼𝗳𝗶𝗹𝗲 𝗚𝗮𝗹𝗹𝗲𝗿𝘆 🌟

📸 Part ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(attachments.length / chunkSize)}
👥 Enjoy the profile pictures!`,
    attachment: chunk
  },
  threadID
);
      }

      setTimeout(async () => {
        for (const filePath of tempFiles) {
          try {
            if (await fs.pathExists(filePath)) {
              await fs.remove(filePath);
            }
          } catch (err) {}
        }
      }, 10000);

    } catch (err) {
      console.error("[ppall] Mass-download crash:", err);
      api.sendMessage("⚠️ Mass profile download aborted due to critical error.", threadID, messageID);
    }
  }
};
