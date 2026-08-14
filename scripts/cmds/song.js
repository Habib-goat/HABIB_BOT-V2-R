/**
 * Riyad Bot Framework
 *
 * Search five songs with Apple's public iTunes Search API, send their
 * cover artworks, then download the selected song after a 1-5 reply.
 *
 * Supported:
 *   sing <song name>
 *   song <song name>
 *   gan <song name>
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const replyManager = require("../replies/replyManager");

const BASE_URL_CONFIG =
  "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json";
const ITUNES_SEARCH_API = "https://itunes.apple.com/search";
const RESULT_LIMIT = 5;

let cachedMahmudApiUrl = null;

function react(api, emoji, messageID) {
  if (typeof api.setMessageReaction === "function") {
    api.setMessageReaction(emoji, messageID, () => {}, true);
  }
}

async function getMahmudApiUrl() {
  if (cachedMahmudApiUrl) return cachedMahmudApiUrl;

  const response = await axios.get(BASE_URL_CONFIG, {
    timeout: 8000,
    headers: { "User-Agent": "Riyad-Bot/1.0" }
  });

  const configured = response.data && response.data.mahmud;
  const candidates = Array.isArray(configured) ? configured : [configured];
  const apiUrl = candidates.find(
    (value) => typeof value === "string" && /^https?:\/\//i.test(value)
  );

  if (!apiUrl) {
    throw new Error("baseApiUrl.json-এ কোনো valid MahMUD API URL পাওয়া যায়নি।");
  }

  cachedMahmudApiUrl = apiUrl.replace(/\/+$/, "");
  return cachedMahmudApiUrl;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSongs(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const seen = new Set();

  return results
    .map((item) => {
      const title = cleanText(item.trackName || item.collectionName);
      const artist = cleanText(item.artistName);
      const artwork = cleanText(item.artworkUrl100 || item.artworkUrl60);

      if (!title || !artist || !artwork) return null;

      const key = `${title.toLowerCase()}-${artist.toLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        title,
        artist,
        query: `${title} ${artist}`,
        duration: item.trackTimeMillis
          ? `${Math.floor(item.trackTimeMillis / 60000)}:${String(
              Math.floor((item.trackTimeMillis % 60000) / 1000)
            ).padStart(2, "0")}`
          : "",
        thumbnail: artwork.replace(/\/[0-9]+x[0-9]+bb\./, "/600x600bb.")
      };
    })
    .filter(Boolean)
    .slice(0, RESULT_LIMIT);
}

async function saveStreamToFile(url, filePath, timeout = 30000) {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout,
    maxRedirects: 5,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (
    contentType.includes("application/json") ||
    contentType.includes("text/html")
  ) {
    response.data.destroy();
    throw new Error("API থেকে valid media file পাওয়া যায়নি।");
  }

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });

  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error("ডাউনলোড করা file খালি।");
  }
}

async function downloadImages(songs, cacheDir) {
  const imagePaths = [];

  for (let index = 0; index < songs.length; index += 1) {
    const imagePath = path.join(
      cacheDir,
      `song_cover_${Date.now()}_${index}.jpg`
    );

    try {
      await saveStreamToFile(songs[index].thumbnail, imagePath, 15000);
      imagePaths.push(imagePath);
    } catch (error) {
      console.error(`[SONG] Cover ${index + 1} failed:`, error.message);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
  }

  return imagePaths;
}

function removeFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      console.error("[SONG] Cache cleanup failed:", error.message);
    }
  }
}

module.exports = {
  config: {
    name: "song",
    aliases: ["sing", "gan", "গান"],
    version: "3.0.0",
    author: "Riyad",
    countDown: 10,
    role: 0,
    description: {
      bn: "গান সার্চ করে ৫টি cover দেখান এবং reply দিয়ে audio download করুন",
      en: "Search five songs and download one by replying with a number"
    },
    category: "music",
    guide: {
      bn: "{pn} <গানের নাম> — download করতে ১-৫ reply দিন",
      en: "{pn} <song name> — reply with 1-5 to download"
    }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const query = args.join(" ").trim();

    if (!query) {
      return api.sendMessage(
        "× গানের নাম লিখুন।\nউদাহরণ: sing shape of you",
        threadID,
        messageID
      );
    }

    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    react(api, "⏳", messageID);

    try {
      const search = await axios.get(ITUNES_SEARCH_API, {
        params: {
          term: query,
          media: "music",
          entity: "song",
          limit: RESULT_LIMIT,
          country: "US"
        },
        timeout: 20000,
        headers: { "User-Agent": "Riyad-Bot/1.0" }
      });

      const songs = normalizeSongs(search.data);
      if (!songs.length) {
        react(api, "❌", messageID);
        return api.sendMessage(
          `× "${query}" নামে কোনো গান পাওয়া যায়নি।`,
          threadID,
          messageID
        );
      }

      const imagePaths = await downloadImages(songs, cacheDir);
      const attachments = imagePaths.map((filePath) =>
        fs.createReadStream(filePath)
      );

      let body = `🎵 "${query}" এর জন্য ${songs.length}টি গান:\n\n`;
      songs.forEach((song, index) => {
        body += `${index + 1}. ${song.title} — ${song.artist}`;
        if (song.duration) body += ` (${song.duration})`;
        body += "\n";
      });
      body += "\nএই message-এ reply করে ১-৫ এর একটি number দিন।";

      return api.sendMessage(
        attachments.length ? { body, attachment: attachments } : body,
        threadID,
        (error, info) => {
          removeFiles(imagePaths);
          if (!error && info?.messageID) {
            replyManager.set(info.messageID, {
              commandName: this.config.name,
              author: senderID,
              songs
            });
          }
        },
        messageID
      );
    } catch (error) {
      console.error("[SONG SEARCH ERROR]", error.response?.data || error.message);
      react(api, "❌", messageID);
      return api.sendMessage(
        `× গান search করা যায়নি: ${error.message}`,
        threadID,
        messageID
      );
    }
  },

  onReply: async function ({ api, event, Reply }) {
    const { threadID, messageID, senderID } = event;
    if (String(senderID) !== String(Reply.author)) return;

    const choice = Number(String(event.body || "").trim());
    if (!Number.isInteger(choice) || choice < 1 || choice > Reply.songs.length) {
      return api.sendMessage(
        `× ১ থেকে ${Reply.songs.length}-এর মধ্যে একটি number reply দিন।`,
        threadID,
        messageID
      );
    }

    const selected = Reply.songs[choice - 1];
    const cacheDir = path.join(__dirname, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `song_${Date.now()}.mp3`);
    react(api, "⏳", messageID);

    try {
      const baseUrl = await getMahmudApiUrl();
      const audioUrl = `${baseUrl}/api/song/mahmud?query=${encodeURIComponent(
        selected.query
      )}`;

      await saveStreamToFile(audioUrl, filePath, 120000);
      react(api, "✅", messageID);

      return api.sendMessage(
        {
          body: `✅ আপনার গান:\n🎵 ${selected.title}\n👤 ${selected.artist}`,
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        (error) => {
          if (error) console.error("[SONG SEND ERROR]", error);
          removeFiles([filePath]);
        },
        messageID
      );
    } catch (error) {
      console.error("[SONG DOWNLOAD ERROR]", error.response?.data || error.message);
      removeFiles([filePath]);
      react(api, "❌", messageID);
      return api.sendMessage(
        `× গান download করা যায়নি: ${error.message}`,
        threadID,
        messageID
      );
    }
  }
};
