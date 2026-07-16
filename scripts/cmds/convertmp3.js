const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");

module.exports = {
  config: {
    name: "convertmp3",
    aliases: ["mp3", "convertmp3"],
    version: "1.0.0",
    role: 0,
    author: "MOHAMMAD AKASH",
    shortDescription: "Convert video to MP3 🎧",
    longDescription: "Download video from URL and convert to MP3.",
    category: "media",
    guide: "{p}convertmp3 <video_url>"
  },

  onStart: async function({ api, event, args, usersData, threadsData }) {
    const { threadID, messageID } = event;

    // Define files cleanups tracker
    const tempFiles = [];
let progressMsgID = null;

async function updateProgress(percent) {
  if (!progressMsgID || !api.editMessage) return;

  const bar =
    "▰".repeat(Math.floor(percent / 10)) +
    "▱".repeat(10 - Math.floor(percent / 10));

  try {
    await api.editMessage(
      `🎧 MP3 Processing...\n\n${bar} ${percent}%`,
      progressMsgID
    );
  } catch {}
}

    try {
      // 🔗 Get video URL from args or replied message
      let url = args.join(" ");
      
      // If no URL in args, check if there's a replied message with attachments
      if (!url && event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0) {
        url = event.messageReply.attachments[0].url;
      }

      if (!url) {
        return api.sendMessage("⚠️ ᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠɪᴅᴇᴏ ᴜʀʟ ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ!", threadID, messageID);
      }

      // ⏳ Progress message
api.sendMessage(
  "🎧 MP3 Processing...\n\n▰▱▱▱▱▱▱▱▱▱ 0%",
  threadID,
  async (err, info) => {
    if (!err) {
      progressMsgID = info.messageID;
      await updateProgress(10);
    }
  },
  messageID
);

      // Ensure cache directory exists
      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);

      // Define unique temporary file paths to support concurrent requests safely
      const requestID = `${Date.now()}_${messageID}`;
      const tempVideoPath = path.join(cacheDir, `temp_video_${requestID}`);
      const outputMp3Path = path.join(cacheDir, `converted_${requestID}.mp3`);

      // Track files for eventual cleanup
      tempFiles.push(tempVideoPath, outputMp3Path);
      
      // 📥 Download the video with stream response to handle large files efficiently
      const response = await axios({
        method: "get",
        url: url,
        responseType: "stream",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });

      // Pipe response stream to temporary video file
      const writer = fs.createWriteStream(tempVideoPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        response.data.on("error", reject);
      });

      await updateProgress(40);
      
      // 🔊 Convert the downloaded video file to a real MP3 using fluent-ffmpeg
      await updateProgress(60);
      await new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .toFormat("mp3")
          .audioBitrate(192) // High-quality audio bitrate
          .on("end", () => {
            resolve();
          })
          .on("error", (err) => {
            reject(err);
          })
          .save(outputMp3Path);
      });

      // Check if file was successfully generated
      await updateProgress(100);
      if (!(await fs.pathExists(outputMp3Path))) {
        throw new Error("FFmpeg output file was not generated.");
      }

      // 🔊 Send back the MP3 file as an attachment
      if (progressMsgID && api.unsendMessage) {
  try {
    await api.unsendMessage(progressMsgID);
  } catch {}
}
      api.sendMessage({
        body: "Mᴘ3 ʀᴇᴀᴅʏ ✅",
        attachment: fs.createReadStream(outputMp3Path)
      }, threadID, async () => {
        // Cleanup files after sending
        for (const file of tempFiles) {
          try {
            if (await fs.pathExists(file)) {
              await fs.unlink(file);
            }
          } catch (cleanupErr) {
            console.error(`[Cleanup Error] Failed to delete: ${file}`, cleanupErr);
          }
        }
      }, messageID);

    } catch (err) {
      console.error(err);
      api.sendMessage(`⚠️ Fᴀɪʟᴇᴅ ᴛᴏ ᴄᴏɴᴠᴇʀᴛ ᴠɪᴅᴇᴏ! Error: ${err.message || err}`, threadID, messageID);
      
      // Cleanup files on error
      for (const file of tempFiles) {
        try {
          if (await fs.pathExists(file)) {
            await fs.unlink(file);
          }
        } catch (cleanupErr) {
          // Ignore cleanup errors on failure path
        }
      }
    }
  }
};
