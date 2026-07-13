/**
 * @file one_time.js
 * @description Riyad Bot - Universal JavaScript File
 * Allows users to view "view once" or expired photo/video media again in Messenger.
 * Triggers when a user replies to a message containing media and types "one time",
 * or uses the bot's command prefix with "one_time".
 */

// In-memory cache to store recent thread media in case they are not fully populated in reply objects
const mediaCache = new Map();

module.exports = {
  config: {
    name: "onetime",
    aliases: ["onetime", "one", "viewonce", "view_once"],
    version: "1.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    description: "View a photo, video, or voice message again by replying with 'one time'.",
    category: "utility",
    guide: {
      en: "Reply to a photo or video and type 'one time', or reply and use the command [prefix]one_time."
    }
  },

  /**
   * onStart - Handled when the user explicitly triggers the command via prefix (e.g., /one_time)
   */
  onStart: async function({ api, event, args, usersData, threadsData }) {
    const { threadID, messageID, messageReply } = event;

    try {
      if (!messageReply) {
        return api.sendMessage(
          "⚠️ Please reply to the view-once photo or video you want to view again.",
          threadID,
          messageID
        );
      }

      const attachments = messageReply.attachments || [];
      if (attachments.length === 0) {
        // Try fallback to cache for this specific replied message
        const cached = mediaCache.get(threadID);
        if (cached && cached.messageID === messageReply.messageID) {
          await handleResendMedia(api, threadID, messageID, cached.attachments);
        } else {
          return api.sendMessage(
            "❌ No attachments or media found in the replied message.",
            threadID,
            messageID
          );
        }
      } else {
        await handleResendMedia(api, threadID, messageID, attachments);
      }
    } catch (error) {
      console.error("[one_time] Error in onStart:", error);
      api.sendMessage("❌ An error occurred while trying to process the media.", threadID, messageID);
    }
  },

  /**
   * onChat - Handled on every incoming message to capture attachments and monitor trigger words
   */
  async function handleResendMedia(api, threadID, messageID, attachments) {
  console.log("Attachments:", JSON.stringify(attachments, null, 2));

  const https = require("https");
  const fs = require("fs");
  const path = require("path");

  const validMedia = attachments.filter(att =>
    ["photo", "video", "animated_image", "audio", "sticker"].includes(att.type)
  );

  // ... বাকি সব কোড ...

}
        if (mediaAttachments.length > 0) {
          mediaCache.set(threadID, {
            messageID,
            attachments: mediaAttachments,
            timestamp: Date.now()
          });

          // Limit cache size to prevent memory leaks (keep last 50 entries)
          if (mediaCache.size > 50) {
            const firstKey = mediaCache.keys().next().value;
            mediaCache.delete(firstKey);
          }
        }
      }

      if (!body) return;

      const cleanBody = body.trim().toLowerCase();

      // Check if user replied and typed "one time" (with or without a leading prefix/character)
      const isTriggered = cleanBody === "one time" || cleanBody.endsWith("one time");

      if (isTriggered && messageReply) {
        const replyAttachments = messageReply.attachments || [];
        if (replyAttachments.length > 0) {
          await handleResendMedia(api, threadID, messageID, replyAttachments);
        } else {
          // Check if we have the attachments in our thread cache
          const cached = mediaCache.get(threadID);
          if (cached && cached.messageID === messageReply.messageID) {
            await handleResendMedia(api, threadID, messageID, cached.attachments);
          } else {
            api.sendMessage("❌ Could not recover the media from that message.", threadID, messageID);
          }
        }
      }
    } catch (error) {
      console.error("[one_time] Error in onChat:", error);
    }
  }
};

/**
 * Downloads and resends media attachments securely using standard HTTPS streams.
 */
async function handleResendMedia(api, threadID, messageID, attachments) {
  console.log("Attachments:", JSON.stringify(attachments, null, 2));

  const https = require("https");
  const fs = require("fs");
  const path = require("path");

  // ...
}

  // Filter for valid visual and audio attachment types
  const validMedia = attachments.filter(att =>
    ["photo", "video", "animated_image", "audio", "sticker"].includes(att.type)
  );

  if (validMedia.length === 0) {
    return api.sendMessage("❌ No valid photo, video, or audio attachments found.", threadID, messageID);
  }

  // Let user know recovery is active
  let statusMsg = await api.sendMessage("🔄 Recovering view-once media, please wait...", threadID);

  const streams = [];
  const tempFiles = [];

  try {
    for (let i = 0; i < validMedia.length; i++) {
      const att = validMedia[i];
      const url = att.url;
      if (!url) continue;

      let ext = ".bin";
      if (att.type === "photo") ext = ".jpg";
      else if (att.type === "video") ext = ".mp4";
      else if (att.type === "animated_image") ext = ".gif";

      const tempPath = path.join(process.cwd(), `temp_viewonce_${Date.now()}_${i}${ext}`);

      await new Promise((resolve, reject) => {
        function download(targetUrl) {
          https.get(targetUrl, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              download(res.headers.location);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            const fileStream = fs.createWriteStream(tempPath);
            res.pipe(fileStream);
            fileStream.on("finish", () => fileStream.close(resolve));
            fileStream.on("error", (err) => fs.unlink(tempPath, () => reject(err)));
          }).on("error", reject);
        }
        download(url);
      });

      streams.push(fs.createReadStream(tempPath));
      tempFiles.push(tempPath);
    }

    if (statusMsg) await api.unsendMessage(statusMsg.messageID);

    await api.sendMessage({
      body: '✅ Here is your "view once" media:',
      attachment: streams
    }, threadID, messageID);

  } catch (error) {
    const links = validMedia.map((att, idx) => `🔗 Media #${idx + 1} (${att.type}): ${att.url}`).join("\n");
    await api.sendMessage(`⚠️ Streaming failed. Recovered links:\n\n${links}`, threadID, messageID);
  } finally {
    for (const filePath of tempFiles) {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
    }
  }
}
