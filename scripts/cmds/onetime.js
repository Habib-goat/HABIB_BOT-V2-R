/**
 * @file one_time.js
 * @description Riyad Bot - Universal JavaScript File
 * Allows users to view "view once" or expired photo/video media again in Messenger.
 * Triggered by replying to a view‑once message with "one time" (or a command prefix).
 *
 * This implementation:
 *  • Caches recent media for quick recovery.
 *  • Detects the trigger word in replies.
 *  • Downloads the original attachment (view‑once links are temporary) and re‑sends it.
 *  • Handles errors gracefully and cleans up temporary files.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// In‑memory cache: threadID → { messageID, attachments, timestamp }
const mediaCache = new Map();

module.exports = {
  config: {
    name: "one_time",
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
   * onStart – invoked when the user explicitly triggers the command via prefix (e.g., /one_time)
   */
  onStart: async function ({ api, event, args, usersData, threadsData }) {
    const { threadID, messageID, messageReply } = event;

    try {
      if (!messageReply) {
        return api.sendMessage(
          "⚠️ Please reply to the view‑once photo or video you want to view again.",
          threadID,
          messageID
        );
      }

      // Attachments can be an array or a single object
      const attachments = Array.isArray(messageReply.attachments)
        ? messageReply.attachments
        : messageReply.attachments
          ? [messageReply.attachments]
          : [];

      if (attachments.length === 0) {
        // Fallback to cache
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
      api.sendMessage(
        "❌ An error occurred while trying to process the media.",
        threadID,
        messageID
      );
    }
  },

  /**
   * onChat – invoked on every incoming message to cache media and detect the trigger word
   */
  onChat: async function ({ api, event, usersData, threadsData }) {
    const { threadID, messageID, body, messageReply, attachments } = event;

    try {
      // 1. Cache any incoming media (photos, videos, etc.)
      if (attachments && attachments.length > 0) {
        const mediaAttachments = attachments.filter((att) =>
          ["photo", "video", "animated_image", "audio", "sticker"].includes(att.type)
        );

        if (mediaAttachments.length > 0) {
          mediaCache.set(threadID, {
            messageID,
            attachments: mediaAttachments,
            timestamp: Date.now()
          });

          // Keep cache small (max 50 entries)
          if (mediaCache.size > 50) {
            const firstKey = mediaCache.keys().next().value;
            mediaCache.delete(firstKey);
          }
        }
      }

      if (!body) return;

      const cleanBody = body.trim().toLowerCase();

      // 2. Detect trigger – "one time" (case‑insensitive, optional prefix)
      const isTriggered =
        cleanBody === "one time" || cleanBody.endsWith("one time");

      if (!isTriggered || !messageReply) return;

      const replyAttachments = Array.isArray(messageReply.attachments)
        ? messageReply.attachments
        : messageReply.attachments
          ? [messageReply.attachments]
          : [];

      if (replyAttachments.length > 0) {
        await handleResendMedia(api, threadID, messageID, replyAttachments);
      } else {
        // Fallback to cache
        const cached = mediaCache.get(threadID);
        if (cached && cached.messageID === messageReply.messageID) {
          await handleResendMedia(api, threadID, messageID, cached.attachments);
        } else {
          api.sendMessage(
            "❌ Could not recover the media from that message.",
            threadID,
            messageID
          );
        }
      }
    } catch (error) {
      console.error("[one_time] Error in onChat:", error);
    }
  }
};

/**
 * Downloads and re‑sends media attachments securely.
 *
 * @param {Object} api           Messenger API interface
 * @param {string} threadID      Thread ID to send the message to
 * @param {string} messageID     ID of the original message (for reply)
 * @param {Array}  attachments   Array of attachment objects
 */
async function handleResendMedia(api, threadID, messageID, attachments) {
  // Filter for supported media types
  const validMedia = attachments.filter((att) =>
    ["photo", "video", "animated_image", "audio", "sticker"].includes(att.type)
  );

  if (validMedia.length === 0) {
    return api.sendMessage(
      "❌ No valid photo, video, or audio attachments found.",
      threadID,
      messageID
    );
  }

  // Inform the user that recovery is in progress
  const statusMsg = await api.sendMessage(
    "🔄 Recovering view‑once media, please wait...",
    threadID,
    messageID
  );

  const tempFiles = [];
  const streams = [];

  try {
    // Download each attachment to a temporary file
    for (let i = 0; i < validMedia.length; i++) {
      const att = validMedia[i];

      // Extract the URL – some APIs use 'url', others 'fileID', or nested in 'media'
      const url =
        att.url ||
        att.fileID ||
        (att.media && att.media.url) ||
        (att.media && att.media.fileID) ||
        null;

      if (!url) continue;

      // Determine a suitable file extension
      let ext = ".bin";
      if (att.type === "photo") ext = ".jpg";
      else if (att.type === "video") ext = ".mp4";
      else if (att.type === "animated_image") ext = ".gif";
      else if (att.type === "audio") ext = ".mp3";

      const tempPath = path.join(
        process.cwd(),
        `temp_viewonce_${Date.now()}_${i}${ext}`
      );

      // Download using HTTPS
      await new Promise((resolve, reject) => {
        const download = (targetUrl) => {
          https
            .get(targetUrl, (res) => {
              if (
                res.statusCode >= 300 &&
                res.statusCode < 400 &&
                res.headers.location
              ) {
                // Follow redirects
                download(res.headers.location);
                return;
              }
              if (res.statusCode !== 200) {
                reject(
                  new Error(`HTTP ${res.statusCode} for ${targetUrl}`)
                );
                return;
              }
              const fileStream = fs.createWriteStream(tempPath);
              res.pipe(fileStream);
              fileStream.on("finish", () => {
                fileStream.close(resolve);
              });
              fileStream.on("error", (err) => {
                fs.unlink(tempPath, () => reject(err));
              });
            })
            .on("error", reject);
        };
        download(url);
      });

      tempFiles.push(tempPath);
      streams.push(fs.createReadStream(tempPath));
    }

    // Remove the status message
    if (statusMsg && statusMsg.messageID) {
      try {
        await api.unsendMessage(statusMsg.messageID);
      } catch {}
    }

    // Send the recovered media
    await api.sendMessage(
      {
        body: "✅ Here is your view‑once media again:",
        attachment: streams
      },
      threadID,
      messageID
    );
  } catch (error) {
    console.error("[one_time] Media recovery error:", error);

    // Fallback: provide direct links that the user can click
    const links = validMedia
      .map((att, idx) => {
        const url =
          att.url ||
          att.fileID ||
          (att.media && att.media.url) ||
          (att.media && att.media.fileID) ||
          "unknown";
        return `🔗 Media #${idx + 1} (${att.type}): ${url}`;
      })
      .join("\n");

    await api.sendMessage(
      `⚠️ Streaming failed. You can try opening the links below:\n\n${links}`,
      threadID,
      messageID
    );
  } finally {
    // Clean up temporary files
    for (const filePath of tempFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
  }
}
