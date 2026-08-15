"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { cleanMediaUrl, downloadById } = require("./riyadPinterestApi");

function downloadToFile(url, filePath, timeout = 150000) {
  return new Promise(async (resolve, reject) => {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const response = await axios.get(url, {
        responseType: "stream",
        timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      const output = fs.createWriteStream(filePath);
      response.data.pipe(output);
      response.data.once("error", reject);
      output.once("finish", resolve);
      output.once("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}

function sendFileWithRetry(api, { body, filePath, threadID, messageID }, retries = 2) {
  let attempt = 0;
  return new Promise((resolve, reject) => {
    const send = () => {
      attempt += 1;
      // A new ReadStream is mandatory for each retry; a consumed stream
      // cannot be uploaded again after Messenger returns 408/metadata errors.
      api.sendMessage(
        { body, attachment: fs.createReadStream(filePath) },
        threadID,
        (error, info) => {
          if (!error) return resolve(info);
          if (attempt <= retries) return setTimeout(send, 700 * attempt);
          reject(error);
        },
        messageID
      );
    };
    send();
  });
}

async function downloadPinterestMedia(media, filePath) {
  if (!media) throw new Error("Pinterest returned no media");
  if (media.isVideo) {
    const url = cleanMediaUrl(media.videoUrl);
    // HLS and gallery-dl's old ytdl: URLs must go through the API's
    // ffmpeg-backed endpoint; axios cannot save an m3u8 playlist as a video.
    if (media.id && (!url || /\.m3u8(?:[?#].*)?$/i.test(url))) {
      return downloadById(media.id, filePath);
    }
    if (!url) throw new Error("Pinterest returned an invalid video URL");
    return downloadToFile(url, filePath);
  }
  const imageUrl = cleanMediaUrl(media.image);
  if (!imageUrl) throw new Error("Pinterest returned an invalid image URL");
  return downloadToFile(imageUrl, filePath);
}

async function removeFile(filePath) {
  try { await fs.promises.unlink(filePath); } catch (_) {}
}

module.exports = {
  downloadToFile,
  downloadPinterestMedia,
  sendFileWithRetry,
  removeFile
};