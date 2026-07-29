const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Persistent cache directory (survives restarts, unlike a tmp file next to the script)
const CACHE_DIR = path.join(__dirname, "..", "..", "data", "protect_cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Simple per-thread lock so our own restore actions don't re-trigger themselves in a loop
const restoring = new Set();

async function downloadImageToDisk(url, destPath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    maxRedirects: 5,
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.facebook.com/"
    }
  });

  const writer = fs.createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

module.exports = {
  config: {
    name: "protect",
    version: "1.4",
    author: "Riyad",
    role: 2,
    shortDescription: "Lock group name, nickname, theme, emoji, photo",
    category: "group",
    guide: "{pn} on/off"
  },

  onStart: async ({ api, event, message, threadsData, args }) => {
    const { threadID } = event;

    if (!args[0]) {
      return api.sendMessage("⚠️ Usage: /protect on | /protect off", threadID);
    }

    if (args[0] === "on") {
      const info = await api.getThreadInfo(threadID);

      const protectData = {
        enable: true,
        name: info.threadName || "",
        emoji: info.emoji || "",
        color: info.color || "",
        imageSrc: info.imageSrc || info.threadPicture || info.groupPhoto || info.image || "",
        localImagePath: "",
        nickname: {}
      };

      const members = info.members || [];
      members.forEach(u => {
        protectData.nickname[u.userID] = u.nickname || "";
      });

      // Cache the current photo to disk RIGHT NOW, while the URL is still valid.
      // Waiting until someone changes the photo to fetch it is what was breaking restores —
      // by then the signed CDN URL has usually expired.
      if (protectData.imageSrc) {
        const localPath = path.join(CACHE_DIR, `${threadID}.jpg`);
        try {
          await downloadImageToDisk(protectData.imageSrc, localPath);
          protectData.localImagePath = localPath;
          console.log("[PROTECT] Cached current group photo to", localPath);
        } catch (err) {
          console.error("[PROTECT] Could not pre-cache group photo:", err.message);
        }
      }

      const thread = (await threadsData.getThread(threadID)) || {};

      await threadsData.updateThread(threadID, {
        settings: {
          ...(thread.settings || {}),
          protect: protectData
        }
      });

      return api.sendMessage(
        "🛡 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n✨ Name, Nickname, Theme, Emoji & Photo are now LOCKED!",
        threadID
      );
    }

    if (args[0] === "off") {
      const thread = await threadsData.getThread(threadID);

      await threadsData.updateThread(threadID, {
        settings: {
          ...thread.settings,
          protect: { enable: false }
        }
      });

      return api.sendMessage("🔓 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗗𝗜𝗦𝗔𝗕𝗟𝗘𝗗\n💥 All locks are now OFF!", threadID);
    }
  },

  onEvent: async ({ api, event, threadsData }) => {
    try {
      const { threadID, logMessageType, logMessageData } = event;

      // DIAGNOSTIC: log every raw log event so we can see what your fca-eryxenx
      // version actually calls the "group photo changed" event. Check your
      // console/PM2 logs right after changing the photo — whatever type prints
      // here for a photo change is the string we need to handle below.
      console.log("[PROTECT][RAW EVENT]", logMessageType, JSON.stringify(logMessageData || {}));

      const thread = await threadsData.getThread(threadID);
      if (!thread) return;

      const protectData = thread.settings?.protect;
      if (!protectData?.enable) return;

      if (restoring.has(threadID)) return; // avoid racing with our own restore

      // Group photo changed — some forks emit this as "log:thread-image",
      // others as "log:thread-icon" reused, or "log:thread-picture".
      // We match any of the known variants here.
      if (
        logMessageType === "log:thread-image" ||
        logMessageType === "log:thread-picture" ||
        logMessageType === "change_thread_image"
      ) {
        if (protectData.localImagePath && fs.existsSync(protectData.localImagePath)) {
          restoring.add(threadID);
          try {
            console.log("[PROTECT] Restoring photo from local cache...");
            await api.changeGroupImage(fs.createReadStream(protectData.localImagePath), threadID);
            console.log("[PROTECT] Photo restored.");
          } catch (imgErr) {
            console.error("[PROTECT] Photo restore failed:", imgErr.message);
          } finally {
            setTimeout(() => restoring.delete(threadID), 3000);
          }
        } else if (protectData.imageSrc) {
          // Fallback: try the stored URL (may be expired, best-effort only)
          const tmpPath = path.join(CACHE_DIR, `${threadID}_restore.jpg`);
          try {
            await downloadImageToDisk(protectData.imageSrc, tmpPath);
            await api.changeGroupImage(fs.createReadStream(tmpPath), threadID);
          } catch (imgErr) {
            console.error("[PROTECT] Fallback photo restore failed (URL likely expired):", imgErr.message);
          } finally {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          }
        } else {
          console.log("[PROTECT] No cached photo available, cannot restore.");
        }
      }

      if (logMessageType === "log:user-nickname") {
        const { participant_id } = logMessageData;
        const lockedNick = protectData.nickname[participant_id] || "";
        await api.changeNickname(lockedNick, threadID, participant_id);
      }

      if (logMessageType === "log:thread-name") {
        await api.setTitle(protectData.name || "", threadID);
      }

      if (logMessageType === "log:thread-icon") {
        await api.changeThreadEmoji(protectData.emoji || "", threadID);
      }

      if (logMessageType === "log:thread-color") {
        await api.changeThreadColor(protectData.color || "", threadID);
      }
    } catch (err) {
      console.error("PROTECT ERROR:", err);
      console.error(err.stack);
    }
  }
};
