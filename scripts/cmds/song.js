const axios = require("axios");

const BASE_URL_CONFIG =
  "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json";

let cachedApiUrl = null;

async function getMahmudApiUrl() {
  if (cachedApiUrl) return cachedApiUrl;

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

  cachedApiUrl = apiUrl.replace(/\/+$/, "");
  return cachedApiUrl;
}

function setReaction(api, emoji, messageID) {
  if (typeof api.setMessageReaction === "function") {
    api.setMessageReaction(emoji, messageID, () => {}, true);
  }
}

module.exports = {
  config: {
    name: "song",
    aliases: ["sing", "gan", "গান"],
    version: "2.0.0",
    author: "Riyad",
    countDown: 10,
    role: 0,
    description: {
      bn: "যেকোনো গান সার্চ করে অডিও ফাইল ডাউনলোড করুন",
      en: "Search and download any song as an audio file"
    },
    category: "music",
    guide: {
      bn: "{pn} <গানের নাম>",
      en: "{pn} <song name>"
    }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const query = args.join(" ").trim();

    if (!query) {
      return api.sendMessage(
        "× গানের নাম লিখুন।\nউদাহরণ: sing shape of you",
        threadID,
        messageID
      );
    }

    try {
      setReaction(api, "⏳", messageID);

      const baseUrl = await getMahmudApiUrl();
      const apiUrl = `${baseUrl}/api/song/mahmud?query=${encodeURIComponent(
        query
      )}`;

      const response = await axios.get(apiUrl, {
        responseType: "stream",
        timeout: 120000,
        maxRedirects: 5,
        headers: { "User-Agent": "Riyad-Bot/1.0" }
      });

      const contentType = String(
        response.headers["content-type"] || ""
      ).toLowerCase();

      if (contentType.includes("application/json") || contentType.includes("text/html")) {
        response.data.destroy();
        throw new Error("API থেকে valid audio file পাওয়া যায়নি।");
      }

      return api.sendMessage(
        {
          body: `✅ আপনার গান:\n🎵 ${query}`,
          attachment: response.data
        },
        threadID,
        (error) => {
          if (error) {
            console.error("[SONG SEND ERROR]", error);
            setReaction(api, "❌", messageID);
            return;
          }
          setReaction(api, "✅", messageID);
        },
        messageID
      );
    } catch (error) {
      console.error("[SONG ERROR]", error.response?.data || error.message);
      setReaction(api, "❌", messageID);

      return api.sendMessage(
        `× গান ডাউনলোড করা যায়নি: ${error.message}`,
        threadID,
        messageID
      );
    }
  }
};
