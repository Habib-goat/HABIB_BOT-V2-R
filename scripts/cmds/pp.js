const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports = {
  config: {
    name: "pp",
    version: "1.2.0",
    author: "EryXenX x Riyad",
    countDown: 3,
    role: 0,
    shortDescription: "View Facebook profile picture 📸",
    longDescription: "View profile picture of any user via reply, mention, or UID.",
    category: "media",
    guide: {
      en: "{pn} [reply / @mention / UID]"
    }
  },

  onStart: async function ({ api, event, args, usersData }) {
    const cacheDir = path.join(__dirname, "cache");
    const cachePath = path.join(cacheDir, `profile_${Date.now()}.png`);

    try {
      await fs.ensureDir(cacheDir);

      let uid = event.senderID;

      if (event.messageReply)
        uid = event.messageReply.senderID;
      else if (Object.keys(event.mentions || {}).length)
        uid = Object.keys(event.mentions)[0];
      else if (args[0] && /^\d+$/.test(args[0]))
        uid = args[0];
      else if (args[0]?.includes("facebook.com"))
        return api.sendMessage(
          "⚠️ Facebook profile link is not supported in this framework. Use UID or mention.",
          event.threadID,
          event.messageID
        );

      let name = "Facebook User";
      try {
        name = await usersData.getName(uid);
      } catch {}

      const imageUrl = `https://graph.facebook.com/${uid}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });

      await fs.writeFile(cachePath, response.data);

      api.sendMessage(
        {
          body: `📸 Profile picture of ${name}`,
          attachment: fs.createReadStream(cachePath)
        },
        event.threadID,
        () => fs.remove(cachePath),
        event.messageID
      );

    } catch (err) {
      console.error("[pp]", err);
      api.sendMessage(
        "⚠️ Failed to fetch profile picture.",
        event.threadID,
        event.messageID
      );
    }
  }
};
