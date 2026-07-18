/**
 * @file inbox.js
 * @description Custom Facebook Messenger Bot Command - "inbox"
 * 
 * Features:
 * 1. Normal Inbox: Sends a dynamic warm greeting to the user's private Messenger inbox.
 * 2. Reply Inbox Forward: Forwards replied content (images, videos, audio, files, text, and video links)
 *    to the user's private inbox. Supports automatic video downloading from URLs.
 * 3. Scope Discipline: Only sends to the command initiator.
 * 4. Error Handling: Gracefully catches blockages and handles missing inbox session errors.
 * 
 * Dependencies: Uses native Node.js and runtime fetch to minimize dependencies.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
  config: {
  name: "inbox",
  version: "1.1.0",
  role: 0,
  countDown: 5,
  credits: "AI Coding Assistant",
  description: "Receive a friendly greeting or forward replied media/text to your private inbox.",
  commandCategory: "utility",
  guide: "inbox"
},

  /**
   * Main command execution entry point
   */
  onStart: async function ({ api, event, args, usersData, threadsData, message }) {

    console.log("Inbox command executed!");
    
    const senderID = event.senderID;
    const threadID = event.threadID;
    const messageID = event.messageID;

    // Optional: Send typing indicator to show the bot is active
    try {
      if (typeof api.sendTypingIndicator === 'function') {
        api.sendTypingIndicator(true, threadID);
      }
    } catch (e) {
      // Ignore typing indicator errors
    }

    // List of dynamic warm greetings
    const greetings = [
      "Hello Baby ❤️",
      "Hello Sir 👋",
      "Hello Ma'am 🌸",
      "Assalamu Alaikum 🤍",
      "Hi There 😊"
    ];

    // Helper: Pick a random greeting
    const getRandomGreeting = () => greetings[Math.floor(Math.random() * greetings.length)];

    // Check if the user is replying to a message
    if (event.messageReply) {
      const reply = event.messageReply;
      const tempFiles = [];

      try {
        let sentAny = false;

        // 1. Forward attachments if present (photos, videos, audio, files)
        if (reply.attachments && reply.attachments.length > 0) {
          for (const attachment of reply.attachments) {
            const type = attachment.type || "file";
            let url = attachment.url || attachment.playableUrl || attachment.previewUrl;

            if (!url) continue;

            // Attempt to download the attachment to a temporary file for streaming
            const ext = getExtensionFromType(type, url);
            const tempPath = path.join(os.tmpdir(), `inbox_fwd_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`);
            
            const downloaded = await downloadFile(url, tempPath);
            if (downloaded) {
              tempFiles.push(tempPath);
              
              // Forward the attachment to the user's private inbox
              await api.sendMessage({
                body: `📬 *Forwarded ${capitalize(type)}:*`,
                attachment: fs.createReadStream(tempPath)
              }, senderID);
              sentAny = true;
            }
          }
        }

        // 2. Handle Text, Links, and Potential Video URL Downloads
        if (reply.body && reply.body.trim().length > 0) {
          const bodyText = reply.body.trim();
          const urlRegex = /(https?:\/\/[^\s]+)/gi;
          const urls = bodyText.match(urlRegex);

          let videoDownloaded = false;

          // If a URL is detected, check if it points to a video we can download
          if (urls && urls.length > 0) {
            for (const url of urls) {
              if (isVideoUrl(url)) {
                const tempVideoPath = path.join(os.tmpdir(), `inbox_vid_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp4`);
                const downloaded = await downloadFile(url, tempVideoPath);
                
                if (downloaded) {
                  tempFiles.push(tempVideoPath);
                  
                  // Send downloaded video as attachment
                  await api.sendMessage({
                    body: `📬 *Forwarded Video from URL:*`,
                    attachment: fs.createReadStream(tempVideoPath)
                  }, senderID);
                  videoDownloaded = true;
                  sentAny = true;
                  break; // Only download the first video match
                }
              }
            }
          }

          // If no video was successfully downloaded, or if there are no URLs, forward the text body
          if (!videoDownloaded) {
            const formattedText = `📬 *Forwarded Message:*\n━━━━━━━━━━━━━━━\n${bodyText}`;
            await api.sendMessage({ body: formattedText }, senderID);
            sentAny = true;
          }
        }

        // Clean up all temporary files immediately after sending
        cleanupTempFiles(tempFiles);

        // If nothing was forwarded (empty message/unsupported format)
        if (!sentAny) {
          await api.sendMessage({ body: "⚠️ The replied message does not contain any forwardable content." }, senderID);
        }

      } catch (err) {
        // Safe cleanup in case of exceptions
        cleanupTempFiles(tempFiles);
        console.error("Inbox Command Error:", err);
        
        // Notify user about inbox restriction or other failures
        await api.sendMessage("❌ Please message me first in inbox.", threadID, messageID);
      }

    } else {
      // --- Normal Inbox Mode ---
      try {
        const greeting = getRandomGreeting();
        const messageContent = `${greeting}\n\nHow can I help you?`;
        
console.log("Trying to send inbox...");
        
        // Send to user's private Messenger thread
        await api.sendMessage({ body: messageContent }, senderID);
        console.log("Inbox sent successfully");

      } catch (err) {
        console.error(err);
        console.error("Inbox Direct Message Error:", err);
        // Reply in the group thread to prompt user to message the bot first
        await api.sendMessage("❌ Please message me first in inbox.", threadID, messageID);
      }
    }
  },

  /**
   * Handle onChat events (Optional framework requirement, kept simple)
   */
  onChat: async function ({ api, event, usersData, threadsData, message }) {
    // Left intentionally empty as Inbox functionality is triggered via onStart command
  }
};

/**
 * Downloads a file from a URL to a target local path
 * @param {string} url - Target download URL
 * @param {string} targetPath - Local file destination path
 * @returns {Promise<boolean>} Success status
 */
async function downloadFile(url, targetPath) {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;

    // Check size limit (max 25MB to comply with Facebook limits)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 25 * 1024 * 1024) {
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(targetPath, buffer);
    return true;
  } catch (err) {
    console.error("Error downloading file:", err);
    return false;
  }
}

/**
 * Checks if a given URL is likely a video link
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isVideoUrl(url) {
  const videoExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.3gp', '.webm'];
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();
    return videoExtensions.some(ext => pathname.endsWith(ext));
  } catch (e) {
    return false;
  }
}

/**
 * Maps standard Messenger attachment types to file extensions
 * @param {string} type - Attachment type (photo, video, audio, etc.)
 * @param {string} url - Attachment URL
 * @returns {string} File extension including dot
 */
function getExtensionFromType(type, url) {
  const extMap = {
    photo: ".jpg",
    video: ".mp4",
    audio: ".mp3",
    file: ".bin",
    animated_image: ".gif"
  };

  if (extMap[type]) return extMap[type];

  // Fallback to reading extension from the URL if possible
  try {
    const parsedUrl = new URL(url);
    const ext = path.extname(parsedUrl.pathname);
    return ext || ".bin";
  } catch (e) {
    return ".bin";
  }
}

/**
 * Capitalizes a string
 */
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Safely deletes an array of temporary files
 * @param {string[]} files - Array of absolute file paths
 */
function cleanupTempFiles(files) {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (err) {
      console.error(`Failed to delete temp file ${file}:`, err);
    }
  }
}
