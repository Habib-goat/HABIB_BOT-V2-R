const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  config: {
    name: "download",
    aliases: ["dl"],
    version: "2.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "media"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const url = args[0];

    if (!url) {
      return api.sendMessage(
        "╭───『 RIYAD BOT 』───╮\n" +
        "│ ⚠️ Error: Please provide a URL!\n" +
        "│ Usage: download [link]\n" +
        "╰─────────────────────╯",
        threadID,
        messageID
      );
    }

    // URL validation
    const urlPattern = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
    if (!urlPattern.test(url)) {
      return api.sendMessage(
        "╭───『 RIYAD BOT 』───╮\n" +
        "│ ⚠️ Error: Invalid URL format!\n" +
        "│ Please enter a valid HTTP/HTTPS link.\n" +
        "╰─────────────────────╯",
        threadID,
        messageID
      );
    }

    // Send visual loading status
    let loadingMessageID = null;
    try {
      const infoMsg = await new Promise((resolve) => {
        api.sendMessage(
          "╭───『 RIYAD BOT 』───╮\n" +
          "│ 📥 Fetching media details...\n" +
          "│ Please wait, processing download...\n" +
          "╰─────────────────────╯",
          threadID,
          (err, info) => {
            if (!err && info) resolve(info);
            else resolve(null);
          },
          messageID
        );
      });
      if (infoMsg) loadingMessageID = infoMsg.messageID;
    } catch (err) {
      console.error("Failed to send loading message:", err);
    }

    // Define direct download file types
    const supportedExtensions = [
      "mp4", "mp3", "jpg", "jpeg", "png", "gif", "pdf", "zip", "txt", "docx"
    ];

    // Helper to get extension from url or headers
    let fileExtension = "";
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (match) {
        fileExtension = match[1].toLowerCase();
      }
    } catch (e) {
      // Ignore URL parsing errors and let axios handle it
    }

    // Setup temporary files cache directory
    const cacheDir = path.join(process.cwd(), "cache");
    await fs.ensureDir(cacheDir);
    const tempFileName = `riyad_dl_${Date.now()}`;

    // Request with timeout & size checking
    try {
      // 1. Head request to verify content-length & content-type if extension not found
      let contentLength = 0;
      let contentType = "";
      
      try {
        const headRes = await axios.head(url, { timeout: 10000 });
        contentLength = parseInt(headRes.headers['content-length'] || "0", 10);
        contentType = headRes.headers['content-type'] || "";
      } catch (headErr) {
        console.warn("HEAD request failed, fallback to GET headers:", headErr.message);
      }

      // Check content size limit: 80MB (80 * 1024 * 1024 bytes)
      const MAX_SIZE = 80 * 1024 * 1024;
      if (contentLength > MAX_SIZE) {
        if (loadingMessageID) {
          try { api.unsendMessage(loadingMessageID); } catch (e) {}
        }
        return api.sendMessage(
          "╭───『 RIYAD BOT 』───╮\n" +
          "│ ⚠️ Error: File is too large!\n" +
          `│ Maximum limit: 80MB.\n` +
          `│ Target size: ${(contentLength / (1024 * 1024)).toFixed(2)}MB.\n` +
          "╰─────────────────────╯",
          threadID,
          messageID
        );
      }

      // Determine extension from content-type if not found in url
      if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
        if (contentType.includes("video/mp4")) fileExtension = "mp4";
        else if (contentType.includes("audio/mpeg") || contentType.includes("audio/mp3")) fileExtension = "mp3";
        else if (contentType.includes("image/jpeg")) fileExtension = "jpg";
        else if (contentType.includes("image/png")) fileExtension = "png";
        else if (contentType.includes("image/gif")) fileExtension = "gif";
        else if (contentType.includes("application/pdf")) fileExtension = "pdf";
        else if (contentType.includes("application/zip")) fileExtension = "zip";
        else if (contentType.includes("text/plain")) fileExtension = "txt";
        else if (contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) fileExtension = "docx";
        else {
          fileExtension = "bin";
        }
      }

      const tempFilePath = path.join(cacheDir, `${tempFileName}.${fileExtension}`);

      // 2. Download file as stream
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        timeout: 45000 // 45 seconds download timeout
      });

      // Confirm size again from GET headers if HEAD request was incomplete
      const getLength = parseInt(response.headers['content-length'] || "0", 10);
      if (getLength > MAX_SIZE) {
        if (loadingMessageID) {
          try { api.unsendMessage(loadingMessageID); } catch (e) {}
        }
        return api.sendMessage(
          "╭───『 RIYAD BOT 』───╮\n" +
          "│ ⚠️ Error: File exceeds 80MB limit!\n" +
          "╰─────────────────────╯",
          threadID,
          messageID
        );
      }

      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Verify file downloaded correctly
      const fileStats = await fs.stat(tempFilePath);
      if (fileStats.size === 0) {
        throw new Error("Downloaded file is empty.");
      }

      // Send file to Messenger thread
      await new Promise((resolve, reject) => {
        api.sendMessage(
          {
            body: "╭───『 RIYAD BOT 』───╮\n" +
                  "│ ✅ Download completed successfully!\n" +
                  "│ File has been delivered below.\n" +
                  "╰─────────────────────╯",
            attachment: fs.createReadStream(tempFilePath)
          },
          threadID,
          async (err) => {
            // Safe cleanup
            try {
              await fs.remove(tempFilePath);
            } catch (cleanupErr) {
              console.error("Cleanup error:", cleanupErr);
            }

            if (err) reject(err);
            else resolve(true);
          },
          messageID
        );
      });

      // Clean up the loading message
      if (loadingMessageID) {
        try {
          api.unsendMessage(loadingMessageID);
        } catch (e) {
          // Continue gracefully
        }
      }

    } catch (error) {
      console.error("Download execution error:", error);
      if (loadingMessageID) {
        try { api.unsendMessage(loadingMessageID); } catch (e) {}
      }
      return api.sendMessage(
        "╭───『 RIYAD BOT 』───╮\n" +
        "│ ⚠️ Download failed!\n" +
        `│ Reason: ${error.message || "Request timed out or invalid link"}\n` +
        "╰─────────────────────╯",
        threadID,
        messageID
      );
    }
  }
};
